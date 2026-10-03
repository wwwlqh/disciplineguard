//+------------------------------------------------------------------+
//| DisciplineGuard.mq5                                              |
//| Counts every trade on this account against your rules: placed    |
//| here, on your phone or on the web terminal. It never holds,      |
//| pauses, changes or closes a trade. Installed and connected by    |
//| the DisciplineGuard Windows app. See SPEC.md §9.2, §9.5.         |
//+------------------------------------------------------------------+
#property copyright   "DisciplineGuard"
#property link        "https://disciplineguard.leowqiheng.workers.dev"
#property version     "0.10"
#property description "Counts every trade against your own rules. It never holds or closes a trade."

#include "DG\AppPanel.mqh"

input ENUM_BASE_CORNER PanelCorner = CORNER_RIGHT_UPPER;  // Panel corner
input double           PanelScale  = 1.0;                 // Panel scale

ulong gLastSecond = 0;
bool  gScanNow = false;

int OnInit()
  {
   gInitTick = GetTickCount64();
   MathSrand((uint)(GetTickCount() ^ (uint)ChartID()));
   gInstance = ((MathRand() << 16) | MathRand()) & 0x7fffffff;
   if(gInstance == 0) gInstance = 1;
   gQueueFile = "queue_" + IntegerToString(ChartID()) + ".txt";
   gCorner = PanelCorner;
   gKey = AccountKey();
   gLast3 = Last3();
   LoadPrefs();
   DGSetScale(PanelScale);
   DGSetPalette(gTheme);
   gBridge.Init();
   LoadConn();
   LoadCache();
   LoadAccountId();
   LoadQueue();
   AdoptOrphanQueues();
   PrimaryTick();
   long now = NowMs();
   BuildModel(now);
   ComputeStatus(now);
   // Draw before anything else; the first sync runs from the timer (SPEC §9.2).
   RenderPanel(true);
   gNextSync = GetTickCount64() + 800;
   EventSetMillisecondTimer(250);
   return INIT_SUCCEEDED;
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
   bool removed = reason == REASON_REMOVE || reason == REASON_CHARTCLOSE || reason == REASON_TEMPLATE;
   if(removed && Linked() && OthersAlive() == 0)
     {
      // The app sends this after the chart is gone (SPEC §9.2 deinit reasons).
      DGJsonWriter w;
      EvBegin(w, "protection_off", NowMs(), false);
      w.Str("reason", reason == REASON_CHARTCLOSE ? "chart_close" : (reason == REASON_TEMPLATE ? "template" : "removed"));
      Enqueue(w, false);
      gBridge.waiting = false;
      SyncSend();
     }
   SavePrefs();
   ReleaseInstance();
   gPanel.Close();
   DGRemovePrefix("");
   ChartRedraw();
  }

void OnTradeTransaction(const MqlTradeTransaction &trans, const MqlTradeRequest &request, const MqlTradeResult &result)
  {
   if(trans.type == TRADE_TRANSACTION_DEAL_ADD || trans.type == TRADE_TRANSACTION_ORDER_DELETE || trans.type == TRADE_TRANSACTION_POSITION)
     {
      gScanNow = true;
      gLastActive = GetTickCount64();
     }
  }

void OnTick() {}

/// Next sync: 60 s while active, 300 s while idle; faster until rules load (SPEC §10.3).
ulong SyncDelay()
  {
   if(!gCacheOk || gAcctState == "") return 10000;
   bool active = GetTickCount64() - gLastActive < DG_ACTIVE_WINDOW_MS || PositionsTotal() > 0 || OrdersTotal() > 0;
   return active ? DG_SYNC_ACTIVE_MS : DG_SYNC_IDLE_MS;
  }

void OnTimer()
  {
   ulong tick = GetTickCount64();
   if(tick - gLastSecond < 1000 && !gScanNow) return;
   gLastSecond = tick;
   gScanNow = false;

   // Login changed without a reinit (terminal connected after start).
   string key = AccountKey();
   if(key != gKey)
     {
      gKey = key; gLast3 = Last3();
      LoadAccountId();
      gCursorLoaded = false;
      gLocalDsbDay = 0; gLocalLimitAt = DG_NONE;
      gNextSync = 0;
     }
   gBridge.Tick();
   AdoptConn(gBridge.conn);
   PrimaryTick();
   long now = NowMs();
   string rpath, rbody;
   int rcode;
   if(gBridge.Poll(rpath, rcode, rbody))
     {
      // The app writes the connection id before the reply, so a first sync is accepted at once.
      gBridge.Tick();
      AdoptConn(gBridge.conn);
      if(rpath == "/v1/sync") OnSyncReply(rcode, rbody);
      if(rpath == "/v1/sync") gNextSync = GetTickCount64() + (gOffline ? 30000 : SyncDelay());
      now = NowMs();
     }
   ScanHistory();
   BuildModel(now);
   TrackStops();
   DayStartCheck(now);
   LimitCheck(now);
   OfflineHeartbeat();

   // One request to the app at a time (SPEC §9.5).
   // A ticked terminal syncs before it has a connection id: that first request is what connects it.
   if((Linked() || gBridge.appState == "on") && tick >= gNextSync && gBridge.MayCall()) SyncSend();

   ComputeStatus(now);
   if(gBreakCard != "" && GetTickCount64() - gBreakCardTick > 120000) gBreakCard = "";
   RenderPanel(false);
  }

void OnChartEvent(const int id, const long &lparam, const double &dparam, const string &sparam)
  {
   if(id == CHARTEVENT_KEYDOWN) { gBridge.Touch(); return; }
   if(id == CHARTEVENT_CHART_CHANGE) { RenderPanel(false); return; }
   if(id != CHARTEVENT_OBJECT_CLICK || StringFind(sparam, DG_PFX) != 0) return;
   PanelClick(sparam);
  }
//+------------------------------------------------------------------+
