//+------------------------------------------------------------------+
//| DisciplineGuard.mq5                                              |
//| A pause before new entries placed from this panel, with your     |
//| own rules and words. Closing, moving SL/TP and cancelling are    |
//| never paused. Installed and connected by the DisciplineGuard     |
//| Windows app. See SPEC.md §9.2, §9.5 and EXPERIENCE.md §7, §9.    |
//+------------------------------------------------------------------+
#property copyright   "DisciplineGuard"
#property link        "https://disciplineguard.leowqiheng.workers.dev"
#property version     "0.10"
#property description "Pauses you at the click, in your own words. The choice stays yours."

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
   if(pzOpen) DecidePause("reinit");
   bool removed = reason == REASON_REMOVE || reason == REASON_CHARTCLOSE || reason == REASON_TEMPLATE;
   if(removed && Linked() && OthersAlive() == 0)
     {
      // The app sends this after the chart is gone (SPEC §9.2 deinit reasons).
      DGJsonWriter w;
      EvBegin(w, "protection_off", NowMs(), false);
      w.Str("reason", reason == REASON_CHARTCLOSE ? "chart_close" : (reason == REASON_TEMPLATE ? "template" : "removed"));
      Enqueue(w, false);
      gBridge.pauseOpen = false;
      gBridge.waiting = false;
      SyncSend();
     }
   SaveEdits();
   SavePrefs();
   ReleaseInstance();
   gPanel.Close(); gCard.Close(); gBackdrop.Close(); gSkipCard.Close();
   DGRemovePrefix("");
   ObjectDelete(0, DG_SLLINE);
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
   PauseTick();
   if(gSkipOpen && GetTickCount64() - gSkipTick > 10000) CloseSkipCard();
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
      else if(rpath == "/v1/baseline") OnBaselineReply(rcode);
      if(rpath == "/v1/sync") gNextSync = GetTickCount64() + (gOffline ? 30000 : SyncDelay());
      now = NowMs();
     }
   ScanHistory();
   TrackPendingOrders();
   BuildModel(now);
   TrackStops();
   DayStartCheck(now);
   LimitCheck(now);
   OfflineHeartbeat();

   // One request to the app at a time (SPEC §9.5).
   // A ticked terminal syncs before it has a connection id: that first request is what connects it.
   if((Linked() || gBridge.appState == "on") && tick >= gNextSync && gBridge.MayCall()) SyncSend();
   else if(gBridge.MayCall()) BaselineTick();

   ComputeStatus(now);
   // One setup report per session when a check still fails after a minute (owner metrics).
   if(!gSetupSent && Linked() && PanelMode() == "setup")
     {
      if(gSetupShownTick == 0) gSetupShownTick = tick;
      if(tick - gSetupShownTick > 60000 && !RunChecks())
        {
         DGJsonWriter w;
         EvBegin(w, "setup", NowMs(), false);
         w.BeginArr("failed");
         for(int i = 0; i < DG_CHECKS; i++) if(!gCheckOk[i]) w.Str("", gCheckName[i]);
         w.EndArr();
         Enqueue(w);
         gSetupSent = true;
        }
     }
   if(gOutsideCard != "" && GetTickCount64() - gOutsideCardTick > 120000) gOutsideCard = "";
   if(!pzOpen) RenderPanel(false);
  }

void OnChartEvent(const int id, const long &lparam, const double &dparam, const string &sparam)
  {
   if(id == CHARTEVENT_KEYDOWN)
     {
      gBridge.Touch();
      if(lparam == 27 && pzOpen) DecidePause("skip"); // Esc skips; Enter does nothing
      if(!pzOpen) RenderPanel(false);
      return;
     }
   if(id == CHARTEVENT_CHART_CHANGE)
     {
      RenderPanel(false);
      if(pzOpen) { DGRemovePrefix("PZ_"); gBackdrop.Close(); gCard.Close(); RelayoutPause(); ChartRedraw(); }
      return;
     }
   if(id == CHARTEVENT_OBJECT_DRAG && sparam == DG_SLLINE)
     {
      gBridge.Touch();
      gSl = PriceStr(_Symbol, ObjectGetDouble(0, DG_SLLINE, OBJPROP_PRICE));
      DGSetEditText("P_SL", gSl);
      SavePrefs();
      return;
     }
   if(id == CHARTEVENT_OBJECT_ENDEDIT)
     {
      gBridge.Touch();
      if(StringFind(sparam, DG_PFX + "P_") == 0) { SaveEdits(); SavePrefs(); UpdateSlLine(); ChartRedraw(); }
      return;
     }
   if(id != CHARTEVENT_OBJECT_CLICK || StringFind(sparam, DG_PFX) != 0) return;
   gBridge.Touch();
   ObjectSetInteger(0, sparam, OBJPROP_STATE, false);
   string n = StringSubstr(sparam, StringLen(DG_PFX));
   if(pzOpen)
     {
      // Place anyway reacts only to this mouse click event on its own button.
      if(n == "PZ_SKIP") DecidePause("skip");
      else if(n == "PZ_PLACE")
        {
         if(gBridge.ClickPossiblyDelayed())
           {
            DGJsonWriter w;
            EvBegin(w, "delayed_click", NowMs(), false);
            w.Long("ms", 0);
            Enqueue(w, false);
           }
         DecidePause("place");
        }
      else if(n == "PZ_FIX") DecidePause("fix");
      else if(StringFind(n, "PZ_CHIP") == 0)
        {
         int c = (int)StringToInteger(StringSubstr(n, 7));
         pzChip = pzChip == c ? -1 : c;
         PauseButtons();
         ChartRedraw();
         return;
        }
      if(!pzOpen) { BuildModel(NowMs()); ComputeStatus(NowMs()); RenderPanel(true); }
      return;
     }
   if(gSkipOpen && StringFind(n, "SK_") == 0)
     {
      CloseSkipCard();
      if(n == "SK_BREAK") TakeBreak(false);
      else if(n == "SK_DONE") TakeBreak(true);
      BuildModel(NowMs()); ComputeStatus(NowMs()); RenderPanel(false);
      return;
     }
   PanelClick(sparam);
  }
//+------------------------------------------------------------------+
