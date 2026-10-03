//+------------------------------------------------------------------+
//| AppModel.mqh                                                     |
//| Builds the evaluate() input from the signed cache, the last      |
//| snapshot, queued local events and the live account, and works    |
//| out the status line (EXPERIENCE §8).                             |
//+------------------------------------------------------------------+
#ifndef DG_APPMODEL_MQH
#define DG_APPMODEL_MQH

#include "AppState.mqh"

datetime gSnapFileTime = 0;

/// Another chart may have synced more recently: take its response when newer.
void RefreshSnapshotFromDisk()
  {
   int h = FileOpen(DG_DIR + "last_sync.json", FILE_READ | FILE_BIN | FILE_SHARE_READ | FILE_SHARE_WRITE);
   if(h == INVALID_HANDLE) return;
   datetime mt = (datetime)FileGetInteger(h, FILE_MODIFY_DATE);
   FileClose(h);
   if(mt <= gSnapFileTime) return;
   gSnapFileTime = mt;
   DGJson j;
   string txt = DGRead("last_sync.json");
   if(!j.Parse(txt)) return;
   if(!gSyncOk || j.Long(j.Get(j.Root(), "serverTime")) > gSJ.Long(gSJ.Get(gSJ.Root(), "serverTime")))
      gSyncOk = gSJ.Parse(txt);
  }

/// Every queued event of this terminal (all charts), as one JSON array.
string AllQueuedJson()
  {
   string out = "";
   for(int i = 0; i < ArraySize(gQueue); i++) out += (out == "" ? "" : ",") + gQueue[i];
   string name;
   long h = FileFindFirst(DG_DIR + "queue_*.txt", name);
   if(h != INVALID_HANDLE)
     {
      do
        {
         if(name == gQueueFile) continue;
         string lines[];
         int n = StringSplit(DGRead(name), '\n', lines);
         for(int k = 0; k < n; k++) if(StringLen(lines[k]) > 2) out += (out == "" ? "" : ",") + lines[k];
        }
      while(FileFindNext(h, name));
      FileFindClose(h);
     }
   return "[" + out + "]";
  }

int SideOf(const string s) { return s == "sell" ? -1 : 1; }

/// excludePos/excludeVol: leave out a fill that is being evaluated after the fact.
void BuildModel(const long now, const ulong excludePos = 0, const double excludeVol = 0)
  {
   gM.Reset();
   if(!gCacheOk) return;
   int root = gPJ.Root();
   gM.LoadRules(gPJ, gPJ.Get(root, "rules"));
   gM.LoadTime(gPJ, gPJ.Get(root, "time"));
   DGHideAmounts = PBool("hideAmounts");

   bool haveDsb = false;
   double dsb = 0;
   long snapDay = DG_NONE, limAt = DG_NONE;
   int s = Snap();
   if(s >= 0)
     {
      int en = gSJ.Get(s, "entries");
      for(int c = gSJ.First(en); c >= 0; c = gSJ.Next(c))
         gM.AddEntry(gSJ.Long(gSJ.Get(c, "t")), gSJ.Str(gSJ.Get(c, "account")), gSJ.Str(gSJ.Get(c, "symbol")), SideOf(gSJ.Str(gSJ.Get(c, "side"))), gSJ.Num(gSJ.Get(c, "size")));
      int cl = gSJ.Get(s, "closes");
      for(int c = gSJ.First(cl); c >= 0; c = gSJ.Next(c))
         gM.AddClose(gSJ.Long(gSJ.Get(c, "t")), gSJ.Str(gSJ.Get(c, "account")), gSJ.Num(gSJ.Get(c, "net")), gSJ.Num(gSJ.Get(c, "size")));
      if(gSJ.Type(gSJ.Get(s, "breakUntil")) == JNUM) gM.breakUntil = gSJ.Long(gSJ.Get(s, "breakUntil"));
      if(gSJ.Type(gSJ.Get(s, "doneUntil")) == JNUM) gM.doneUntil = gSJ.Long(gSJ.Get(s, "doneUntil"));
      int ac = gSJ.Get(s, "accounts");
      for(int a = gSJ.First(ac); a >= 0; a = gSJ.Next(a))
        {
         string id = gSJ.Key(a);
         int v = gSJ.Get(a, "dayStartBalance");
         int l = gSJ.Get(a, "limitReachedAt");
         if(id == gAcctId)
           {
            snapDay = gSJ.Long(gSJ.Get(a, "dayStart"), DG_NONE);
            if(gSJ.Type(v) == JNUM) { haveDsb = true; dsb = gSJ.Num(v); }
            if(gSJ.Type(l) == JNUM) limAt = gSJ.Long(l);
            continue;
           }
         int i = gM.AddAcctState(id, "mt5", false);
         if(gSJ.Type(v) == JNUM) { gM.sHasDsb[i] = true; gM.sDsb[i] = gSJ.Num(v); }
         if(gSJ.Type(l) == JNUM) gM.sLimitAt[i] = gSJ.Long(l);
        }
     }

   // Events queued here and not synced yet.
   DGJson q;
   if(q.Parse(AllQueuedJson()))
      for(int e = q.First(q.Root()); e >= 0; e = q.Next(e))
        {
         string type = q.Str(q.Get(e, "type"));
         long t = q.Long(q.Get(e, "t"));
         bool mine = q.Str(q.Get(e, "acct")) == gKey && gAcctId != "";
         if(type == "entry" && mine) gM.AddEntry(t, gAcctId, q.Str(q.Get(e, "symbol")), SideOf(q.Str(q.Get(e, "side"))), q.Num(q.Get(e, "size")));
         else if(type == "close" && mine) gM.AddClose(t, gAcctId, q.Num(q.Get(e, "net")), q.Num(q.Get(e, "size")));
         else if(type == "break") gM.breakUntil = MathMax(gM.breakUntil, q.Long(q.Get(e, "until")));
         else if(type == "done_today") gM.doneUntil = MathMax(gM.doneUntil, q.Long(q.Get(e, "until")));
        }

   // The live account.
   if(gAcctId != "")
     {
      int i = gM.AddAcctState(gAcctId, "mt5", IsNetting());
      long rs[];
      gM.AccountResets(gAcctId, rs);
      long start, end;
      gM.DayOf(rs, now, start, end);
      if(haveDsb && snapDay == start) { gM.sHasDsb[i] = true; gM.sDsb[i] = dsb; }
      else if(gLocalDsbDay == start && start != LONG_MIN) { gM.sHasDsb[i] = true; gM.sDsb[i] = gLocalDsb; }
      gM.sHasEq[i] = true;
      gM.sEq[i] = AccountInfoDouble(ACCOUNT_EQUITY);
      gM.sCredit[i] = AccountInfoDouble(ACCOUNT_CREDIT);
      long la = MathMax(limAt, gLocalLimitAt);
      if(la != DG_NONE) gM.sLimitAt[i] = la;
      for(int p = PositionsTotal() - 1; p >= 0; p--)
        {
         ulong tk = PositionGetTicket(p);
         if(tk == 0) continue;
         double vol = PositionGetDouble(POSITION_VOLUME);
         if(tk == excludePos) vol -= excludeVol;
         if(vol <= 1e-9) continue;
         gM.AddPosition(gAcctId, PositionGetString(POSITION_SYMBOL), PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY ? 1 : -1, vol);
        }
     }
   gM.clockVerified = gClockSynced;
   gM.clockAnchor = gLastContact > 0 ? gLastContact + (long)(GetTickCount64() - gInitTick) : DG_NONE;
  }

//--- enforcement and status (SPEC §10.5, EXPERIENCE §8) ------------------
#define ST_ON        0
#define ST_OFFLINE   1
#define ST_SETUP     2
#define ST_ATTENTION 3
#define ST_OFF       4

int    gStatus = ST_SETUP;
string gStatusText = "";

bool PlanExpired(const long now)
  {
   long vu = PLong("license.validUntil", 0);
   return vu > 0 && now > vu + 7 * (long)DG_DAY;
  }

/// True when this terminal counts this account's trades against the rules now.
bool Enforcing(const long now)
  {
   if(!gCacheOk || !Linked() || gOffReason != "") return false;
   if(!PBool("license.enforcing")) return false;
   if(PlanExpired(now)) return false;
   if(gAcctId == "" || gAcctState == "new" || gAcctState == "cap") return false;
   if(!PValid("accounts." + gAcctId)) return false;           // removed on the website
   return PBool("accounts." + gAcctId + ".enforced", true);
  }

string ServerShort() { return AccountInfoString(ACCOUNT_SERVER); }

string OffLine(const long now)
  {
   if(gOffReason == "account_deleted") return "Off · Account deleted · Trades aren't counted";
   if(gOffReason != "") return "Off · Signed out · Trades aren't counted";
   if(gCacheOk && !PBool("license.enforcing")) return "Off · Trades aren't counted";
   if(PlanExpired(now)) return "Off · Can't confirm your plan · Trades aren't counted";
   if(gAcctState == "cap") return "Off · The free plan covers 1 account · Trades aren't counted";
   if(gAcctState == "taken") return "Off · This account is on another DisciplineGuard login · Trades aren't counted";
   if(gAcctState == "new") return "Off · New account, not counted yet · Trades aren't counted";
   if(gAcctId != "" && gCacheOk && !PValid("accounts." + gAcctId)) return "Off · This account was removed · Trades aren't counted";
   return "Off · Trades aren't counted";
  }

void ComputeStatus(const long now)
  {
   if(TerminalInfoInteger(TERMINAL_VPS)) { gStatus = ST_OFF; gStatusText = "Off · Can't run on MetaQuotes' built-in VPS. Use your terminal or your own VPS."; gStatusCode = "vps"; return; }
   if(gOffReason != "") { gStatus = ST_OFF; gStatusText = OffLine(now); gStatusCode = "off"; return; }
   if(!Linked())
     {
      gStatus = ST_SETUP;
      gStatusText = !gBridge.appAlive ? "Setting up · Open the DisciplineGuard app on this computer"
                    : (gBridge.appState == "signed_out" ? "Setting up · Sign in to the DisciplineGuard app"
                       : (gBridge.appState == "not_protected" ? "Setting up · Tick this MetaTrader in the DisciplineGuard app" : "Setting up · Connecting…"));
      gStatusCode = "setting_up";
      return;
     }
   if(!gCacheOk)
     {
      if(gAuthFail) { gStatus = ST_ATTENTION; gStatusText = "Needs attention · Sign in to the DisciplineGuard app again"; gStatusCode = "attention"; return; }
      gStatus = ST_SETUP;
      gStatusText = !gBridge.appAlive ? "Setting up · Open the DisciplineGuard app on this computer" : (gOffline ? "Setting up · Can't reach DisciplineGuard" : "Setting up · Loading your rules");
      gStatusCode = "setting_up";
      return;
     }
   if(!Enforcing(now)) { gStatus = ST_OFF; gStatusText = OffLine(now); gStatusCode = "off"; return; }
   if(gAuthFail) { gStatus = ST_ATTENTION; gStatusText = "Needs attention · Sign in to the DisciplineGuard app again. Rules still apply."; gStatusCode = "attention"; return; }
   if(!gBridge.appAlive && gLastContact > 0)
     {
      gStatus = ST_OFFLINE;
      gStatusText = "On (offline) · App not running. Rules from " + DGFmtTime(gM, gLastContact, now) + " apply.";
      gStatusCode = "offline";
      return;
     }
   if(gOffline && gLastContact > 0 && now - gLastContact > 3 * (long)DG_MIN)
     {
      gStatus = ST_OFFLINE;
      gStatusText = now - gLastContact > (long)DG_DAY
                    ? "On (offline) · Offline since " + DGFmtTime(gM, gLastContact, now) + ". Rules are still on."
                    : "On (offline) · Using rules saved at " + DGFmtTime(gM, gLastContact, now) + ". Can't reach our server.";
      gStatusCode = "offline";
      return;
     }
   gStatusCode = "on";
   if(!gPrimary) { gStatus = ST_ON; gStatusText = "On · Another chart is doing the counting."; return; }
   gStatus = ST_ON;
   long t = gM.SafeNow(now);
   int n = gM.EntriesToday(t);
   string s = "On · ";
   s += gM.r1On ? StringFormat("%d of %d trades", n, gM.r1Max) : StringFormat("%d trade%s today", n, n == 1 ? "" : "s");
   bool inL; double loss, lim; long until;
   if(gM.r8On && gM.R8Status(gAcctId, t, inL, loss, lim, until) && lim > 0)
      s += " · Loss " + (loss > 0 ? DGFmtMoney(-loss, true) : DGFmtMoney(0)) + " of " + DGFmtMoney(lim);
   gStatusText = s;
  }

uint StatusColor()
  {
   if(gStatus == ST_ON || gStatus == ST_OFFLINE) return DGPal.accent;
   if(gStatus == ST_SETUP) return DGPal.blue;
   if(gStatus == ST_ATTENTION) return DGPal.amber;
   return DGPal.grey;
  }

#endif
