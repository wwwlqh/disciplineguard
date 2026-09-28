//+------------------------------------------------------------------+
//| AppState.mqh                                                     |
//| The EA's state: connection id, signed rule cache, last sync,     |
//| event queue, one primary per terminal, and the sync request      |
//| sent through the Windows app (SPEC §9.2, §9.5, §10.3, §10.5).    |
//+------------------------------------------------------------------+
#ifndef DG_APPSTATE_MQH
#define DG_APPSTATE_MQH

#include <Trade\Trade.mqh>
#include "Config.mqh"
#include "Core.mqh"
#include "Ed25519.mqh"
#include "Store.mqh"
#include "Bridge.mqh"
#include "Copy.mqh"
#include "Ui.mqh"

#define DG_SYNC_ACTIVE_MS   60000
#define DG_SYNC_IDLE_MS     300000
#define DG_ACTIVE_WINDOW_MS 600000
#define DG_OFFLINE_HB_MS    60000
#define DG_QUEUE_MAX        1500
#define DG_SEND_MAX         100

DGBridge gBridge;
DGModel  gM;
DGJson   gPJ;              // signed payload (rules, time, popup, license)
DGJson   gSJ;              // last sync response (snapshot, accounts)
CTrade   gTrade;

//--- connection and cache
string   gConn = "";                 // connection id, set by the Windows app (SPEC §9.5)
string   gPayload = "", gSig = "", gHash = "";
bool     gCacheOk = false;
bool     gSyncOk = false;             // gSJ holds a good response
long     gLastContact = 0;            // server time of the last good sync (persisted)
long     gServerTime = 0;
ulong    gServerTick = 0;
bool     gClockSynced = false;        // a sync succeeded in this session
ulong    gInitTick = 0;
bool     gAuthFail = false;           // 401 or 403: the app must sign in again
bool     gOffline = false;            // the last request failed
int      gSyncSent = 0;               // events in the sync request waiting for its reply
string   gOffReason = "";             // the server ended this connection
ulong    gNextSync = 0;
ulong    gLastActive = 0;
ulong    gLastHb = 0;

//--- this trading account
string   gKey = "", gAcctId = "", gAcctState = "", gLast3 = "";
bool     gProtect = false;
bool     gCursorLoaded = false;
long     gScanFrom = 0;              // UTC ms: history scanned up to here
string   gCursorSent = "", gCursorAcked = "";
double   gLocalDsb = 0;              // day-start balance computed here
long     gLocalDsbDay = 0;
long     gLocalLimitAt = DG_NONE;

//--- instance
int      gInstance = 0;
bool     gPrimary = false;
string   gQueue[];
string   gQueueFile = "";

//--- time ------------------------------------------------------------
/// UTC epoch ms. Server time plus monotonic ticks once a sync succeeded, else the PC clock.
long NowMs()
  {
   if(gClockSynced) return gServerTime + (long)(GetTickCount64() - gServerTick);
   return (long)TimeGMT() * 1000;
  }

/// Broker server time minus UTC, in seconds, rounded to 15 minutes.
long BrokerOffsetSec()
  {
   long d = (long)TimeTradeServer() - (long)TimeGMT();
   return (long)MathRound(d / 900.0) * 900;
  }

long DealUtcMs(const long serverMsc) { return serverMsc - BrokerOffsetSec() * 1000; }

string NewId(const string prefix)
  {
   return prefix + IntegerToString(gInstance) + "_" + IntegerToString((long)GetTickCount64()) + "_" + IntegerToString(MathRand());
  }

long NextSeq()
  {
   if(!GlobalVariableCheck("DG_SEQ")) GlobalVariableSet("DG_SEQ", (double)(TimeLocal() - 1700000000) * 10);
   for(int i = 0; i < 50; i++)
     {
      double v = GlobalVariableGet("DG_SEQ");
      if(GlobalVariableSetOnCondition("DG_SEQ", v + 1, v)) return (long)v + 1;
     }
   return (long)GetTickCount64();
  }

//--- account -----------------------------------------------------------
string AccountKey() { return IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + "@" + AccountInfoString(ACCOUNT_SERVER); }

bool IsNetting()
  {
   long mm = AccountInfoInteger(ACCOUNT_MARGIN_MODE);
   return mm == ACCOUNT_MARGIN_MODE_RETAIL_NETTING || mm == ACCOUNT_MARGIN_MODE_EXCHANGE;
  }

string Last3()
  {
   string s = IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN));
   return StringLen(s) <= 3 ? s : StringSubstr(s, StringLen(s) - 3);
  }

//--- one primary per terminal (SPEC §9.2) -----------------------------
void PrimaryTick()
  {
   double nowL = (double)TimeLocal();
   string inst = "DG_INST_" + IntegerToString(gInstance);
   if(!GlobalVariableCheck(inst)) GlobalVariableTemp(inst);
   GlobalVariableSet(inst, nowL);
   if(!GlobalVariableCheck("DG_PRIMARY_ID"))
     {
      GlobalVariableTemp("DG_PRIMARY_ID");
      GlobalVariableTemp("DG_PRIMARY_TS");
      GlobalVariableSet("DG_PRIMARY_TS", nowL);
      GlobalVariableSet("DG_PRIMARY_ID", gInstance);
     }
   double id = GlobalVariableGet("DG_PRIMARY_ID");
   if((int)id == gInstance)
     {
      GlobalVariableSet("DG_PRIMARY_TS", nowL);
      gPrimary = true;
      return;
     }
   double ts = GlobalVariableGet("DG_PRIMARY_TS");
   if((nowL - ts > 30 || ts - nowL > 30) && GlobalVariableSetOnCondition("DG_PRIMARY_ID", gInstance, id))
     {
      GlobalVariableSet("DG_PRIMARY_TS", nowL);
      gPrimary = true;
      return;
     }
   gPrimary = false;
  }

/// Other DisciplineGuard charts alive in this terminal (seen in the last 5 s).
int OthersAlive()
  {
   int n = 0;
   double nowL = (double)TimeLocal();
   for(int i = GlobalVariablesTotal() - 1; i >= 0; i--)
     {
      string nm = GlobalVariableName(i);
      if(StringFind(nm, "DG_INST_") != 0 || nm == "DG_INST_" + IntegerToString(gInstance)) continue;
      if(MathAbs(nowL - GlobalVariableGet(nm)) <= 5) n++;
     }
   return n;
  }

void ReleaseInstance()
  {
   GlobalVariableDel("DG_INST_" + IntegerToString(gInstance));
   if(GlobalVariableCheck("DG_PRIMARY_ID") && (int)GlobalVariableGet("DG_PRIMARY_ID") == gInstance)
     {
      GlobalVariableDel("DG_PRIMARY_ID");
      GlobalVariableDel("DG_PRIMARY_TS");
     }
  }

//--- connection and cache -------------------------------------------------
bool Linked() { return gConn != ""; }

/// The last connection id the app gave this terminal, so saved rules apply while the app is closed.
void LoadConn() { gConn = DGRead("conn.txt"); }

string Sha256Hex(const string s)
  {
   uchar data[], key[], out[];
   DGUtf8(s, data);
   if(CryptEncode(CRYPT_HASH_SHA256, data, key, out) <= 0) return "";
   string h = "";
   for(int i = 0; i < ArraySize(out); i++) h += StringFormat("%02x", out[i]);
   return h;
  }

/// Verifies and loads a signed payload. A cache that fails verification is ignored (SPEC §10.5).
bool AcceptSigned(const string payload, const string sig)
  {
   uchar msg[], sg[], pk[];
   int n = DGUtf8(payload, msg);
   if(!DGHexDecode(sig, sg) || !DGHexDecode(DG_PUBKEY, pk)) return false;
   if(!DGEd25519Verify(sg, msg, n, pk)) return false;
   DGJson j;
   if(!j.Parse(payload)) return false;
   if(j.Long(j.Get(j.Root(), "v")) != 1 || j.Str(j.Get(j.Root(), "conn")) != gConn) return false;
   gPJ.Parse(payload);
   gPayload = payload; gSig = sig; gHash = Sha256Hex(payload);
   gCacheOk = true;
   return true;
  }

void LoadCache()
  {
   gCacheOk = false;
   string p = DGRead("cache.payload"), s = DGRead("cache.sig");
   if(p != "" && s != "") AcceptSigned(p, s);
   string last = DGRead("last_sync.json");
   gSyncOk = last != "" && gSJ.Parse(last);
   gLastContact = StringToInteger(DGRead("contact.txt"));
  }

void SaveCache()
  {
   DGWrite("cache.payload", gPayload);
   DGWrite("cache.sig", gSig);
  }

/// Removes everything this terminal knows about its connection. Enforcement ends here (SPEC §10.5 a, b, e).
void ForgetConnection(const string reason)
  {
   DGDelete("conn.txt"); DGDelete("cache.payload"); DGDelete("cache.sig"); DGDelete("last_sync.json");
   DGDelete("accounts.json"); DGDelete("baseline_todo.txt");
   gConn = ""; gCacheOk = false; gSyncOk = false; gHash = "";
   gAcctId = ""; gAcctState = ""; gCursorLoaded = false;
   ArrayResize(gQueue, 0);
   DGDelete(gQueueFile);
   gOffReason = reason;
   gAuthFail = false;
  }

/// The app registered this terminal (again). A different id means a new login or a reinstall.
void AdoptConn(const string conn)
  {
   if(conn == "" || conn == gConn) return;
   if(gConn != "") ForgetConnection("");
   gConn = conn;
   DGWrite("conn.txt", conn);
   gOffReason = "";
   gNextSync = 0;
  }

//--- payload helpers -------------------------------------------------------
bool   PBool(const string path, const bool def = false) { return gCacheOk ? gPJ.Bool(gPJ.Path(gPJ.Root(), path), def) : def; }
long   PLong(const string path, const long def = 0) { return gCacheOk ? gPJ.Long(gPJ.Path(gPJ.Root(), path), def) : def; }
string PStr(const string path, const string def = "") { return gCacheOk ? gPJ.Str(gPJ.Path(gPJ.Root(), path), def) : def; }
bool   PValid(const string path) { return gCacheOk && gPJ.Valid(gPJ.Path(gPJ.Root(), path)); }

long Magic() { return PLong("magic", 0); }

//--- known account ids (persisted so rules apply before the first sync) ---
void LoadAccountId()
  {
   gAcctId = ""; gAcctState = "";
   DGJson j;
   if(!j.Parse(DGRead("accounts.json"))) return;
   int a = j.Get(j.Root(), gKey);
   gAcctId = j.Str(j.Get(a, "id"));
   gAcctState = j.Str(j.Get(a, "state"));
  }

void SaveAccountId()
  {
   DGJson j;
   DGJsonWriter w;
   w.BeginObj();
   if(j.Parse(DGRead("accounts.json")))
      for(int c = j.First(j.Root()); c >= 0; c = j.Next(c))
         if(j.Key(c) != gKey)
           {
            w.BeginObj(j.Key(c)); w.Str("id", j.Str(j.Get(c, "id"))); w.Str("state", j.Str(j.Get(c, "state"))); w.EndObj();
           }
   w.BeginObj(gKey); w.Str("id", gAcctId); w.Str("state", gAcctState); w.EndObj();
   w.EndObj();
   DGWrite("accounts.json", w.Text());
  }

//--- event queue ---------------------------------------------------------
void LoadQueue()
  {
   ArrayResize(gQueue, 0);
   string txt = DGRead(gQueueFile);
   if(txt == "") return;
   string lines[];
   int n = StringSplit(txt, '\n', lines);
   for(int i = 0; i < n; i++)
      if(StringLen(lines[i]) > 2) { int k = ArraySize(gQueue); ArrayResize(gQueue, k + 1); gQueue[k] = lines[i]; }
  }

void SaveQueue()
  {
   if(ArraySize(gQueue) == 0) { DGDelete(gQueueFile); return; }
   string txt = "";
   for(int i = 0; i < ArraySize(gQueue); i++) txt += gQueue[i] + "\n";
   DGWrite(gQueueFile, txt);
  }

/// Takes over queue files left by charts that are no longer open.
void AdoptOrphanQueues()
  {
   string name;
   long h = FileFindFirst(DG_DIR + "queue_*.txt", name);
   if(h == INVALID_HANDLE) return;
   string orphans[];
   do
     {
      long cid = StringToInteger(StringSubstr(name, 6, StringLen(name) - 10));
      if("queue_" + IntegerToString(cid) + ".txt" != name || name == gQueueFile) continue;
      bool open = false;
      for(long c = ChartFirst(); c >= 0; c = ChartNext(c)) if(c == cid) { open = true; break; }
      if(!open) { int k = ArraySize(orphans); ArrayResize(orphans, k + 1); orphans[k] = name; }
     }
   while(FileFindNext(h, name));
   FileFindClose(h);
   for(int i = 0; i < ArraySize(orphans); i++)
     {
      string lines[];
      int n = StringSplit(DGRead(orphans[i]), '\n', lines);
      for(int k = 0; k < n; k++)
         if(StringLen(lines[k]) > 2 && ArraySize(gQueue) < DG_QUEUE_MAX) { int m = ArraySize(gQueue); ArrayResize(gQueue, m + 1); gQueue[m] = lines[k]; }
      DGDelete(orphans[i]);
     }
   if(ArraySize(orphans) > 0) SaveQueue();
  }

/// Starts an event. Finish it with Enqueue().
void EvBegin(DGJsonWriter &w, const string type, const long t, const bool withAccount = true)
  {
   w.BeginObj();
   w.Str("id", NewId("e"));
   w.Long("seq", NextSeq());
   w.Str("type", type);
   w.Long("t", t);
   if(withAccount) w.Str("acct", gKey);
  }

void Enqueue(DGJsonWriter &w, const bool soon = true)
  {
   w.EndObj();
   if(ArraySize(gQueue) >= DG_QUEUE_MAX)
     {
      // Drop the oldest heartbeat to make room; never drop trades or pauses.
      for(int i = 0; i < ArraySize(gQueue); i++)
         if(StringFind(gQueue[i], "\"type\":\"hb\"") >= 0)
           {
            for(int k = i; k < ArraySize(gQueue) - 1; k++) gQueue[k] = gQueue[k + 1];
            ArrayResize(gQueue, ArraySize(gQueue) - 1);
            break;
           }
     }
   int n = ArraySize(gQueue);
   ArrayResize(gQueue, n + 1);
   gQueue[n] = w.Text();
   SaveQueue();
   if(soon && Linked()) gNextSync = MathMin(gNextSync, GetTickCount64() + 3000);
  }

//--- sync (SPEC §10.3): heartbeat, events and rules in one call ------------
string gStatusCode = "setting_up";

void WriteAccount(DGJsonWriter &w)
  {
   w.BeginObj();
   w.Str("key", gKey);
   w.Str("platform", "mt5");
   w.Str("server", AccountInfoString(ACCOUNT_SERVER));
   w.Str("login", IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)));
   w.Str("broker", AccountInfoString(ACCOUNT_COMPANY));
   w.Str("currency", AccountInfoString(ACCOUNT_CURRENCY));
   w.Bool("netting", IsNetting());
   w.Bool("demo", AccountInfoInteger(ACCOUNT_TRADE_MODE) == ACCOUNT_TRADE_MODE_DEMO);
   w.Bool("tradeAllowed", AccountInfoInteger(ACCOUNT_TRADE_EXPERT) != 0 && AccountInfoInteger(ACCOUNT_TRADE_ALLOWED) != 0);
   w.Num("balance", AccountInfoDouble(ACCOUNT_BALANCE));
   w.Num("equity", AccountInfoDouble(ACCOUNT_EQUITY));
   w.Num("credit", AccountInfoDouble(ACCOUNT_CREDIT));
   if(gProtect) w.Bool("protect", true);
   if(gCursorAcked != "") w.Str("cursor", gCursorAcked);
   w.EndObj();
  }

/// Hands a sync request to the Windows app. The reply arrives in OnSyncReply().
bool SyncSend()
  {
   if(AccountInfoInteger(ACCOUNT_LOGIN) == 0) return false;
   int n = MathMin(ArraySize(gQueue), DG_SEND_MAX);
   DGJsonWriter w;
   w.BeginObj();
   w.Str("role", gPrimary ? "primary" : "secondary");
   w.Str("version", DG_VERSION);
   w.Str("state", gStatusCode);
   w.Bool("pushReady", false);
   w.Str("signedHash", gCacheOk ? gHash : "");
   w.BeginArr("accounts"); WriteAccount(w); w.EndArr();
   w.BeginArr("events");
   for(int i = 0; i < n; i++) w.Raw("", gQueue[i]);
   w.EndArr();
   w.EndObj();
   if(!gBridge.Send("/v1/sync", w.Text())) return false;
   gSyncSent = n;
   gCursorSent = gScanFrom > 0 && gCursorLoaded ? IntegerToString(gScanFrom) : gCursorAcked;
   return true;
  }

/// Handles 410 (connection ended) and 401/403 (the app must sign in again). -1 means the app didn't answer.
void OnSyncReply(const int code, const string resp)
  {
   int n = gSyncSent;
   gSyncSent = 0;
   if(code == 410)
     {
      DGJson j;
      j.Parse(resp);
      ForgetConnection(j.Str(j.Get(j.Root(), "status"), "connection_removed"));
      return;
     }
   if(code == 401 || code == 403) { gAuthFail = true; gOffline = false; return; }
   if(code != 200) { gOffline = true; return; }
   if(!gSJ.Parse(resp)) { gOffline = true; gSyncOk = gSJ.Parse(DGRead("last_sync.json")); return; }

   int r = gSJ.Root();
   gOffline = false; gAuthFail = false; gSyncOk = true;
   gServerTime = gSJ.Long(gSJ.Get(r, "serverTime"));
   gServerTick = GetTickCount64();
   gClockSynced = true;
   gLastContact = gServerTime;
   DGWrite("contact.txt", IntegerToString(gLastContact));
   // Signed block: only sent when it changed.
   int sg = gSJ.Get(r, "signed");
   if(gSJ.Valid(sg))
     {
      if(AcceptSigned(gSJ.Str(gSJ.Get(sg, "payload")), gSJ.Str(gSJ.Get(sg, "sig")))) SaveCache();
      else gHash = ""; // ask again next time
     }
   // This account's state.
   int ac = gSJ.Get(r, "accounts");
   for(int c = gSJ.First(ac); c >= 0; c = gSJ.Next(c))
      if(gSJ.Str(gSJ.Get(c, "key")) == gKey)
        {
         string st = gSJ.Str(gSJ.Get(c, "state"));
         string id = gSJ.Str(gSJ.Get(c, "id"));
         if(st != gAcctState || id != gAcctId) { gAcctState = st; gAcctId = id; SaveAccountId(); }
         if(st == "active") gProtect = false;
        }
   // History cursor: only read once, at start.
   if(!gCursorLoaded && gAcctId != "")
     {
      int cur = gSJ.Path(r, "cursors");
      int cv = gSJ.Get(cur, gKey);
      long now = NowMs();
      long c0 = gSJ.Type(cv) == JSTR ? StringToInteger(gSJ.Str(cv)) : 0;
      // Never scan back more than 7 days. A new account starts now: trades from before connecting are not "outside".
      gScanFrom = c0 > 0 ? MathMax(c0, now - 7 * (long)DG_DAY) : now;
      gCursorLoaded = true;
     }
   gCursorAcked = gCursorSent;
   // Sent events are stored (idempotent), so they leave the queue.
   if(n > 0)
     {
      int left = MathMax(ArraySize(gQueue) - n, 0);
      for(int i = 0; i < left; i++) gQueue[i] = gQueue[i + n];
      ArrayResize(gQueue, left);
      SaveQueue();
     }
   DGWrite("last_sync.json", resp);
  }

//--- snapshot helpers (from the last sync) --------------------------------
int Snap() { return gSyncOk ? gSJ.Get(gSJ.Root(), "snapshot") : -1; }

#endif
