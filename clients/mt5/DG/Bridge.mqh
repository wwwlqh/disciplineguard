//+------------------------------------------------------------------+
//| Bridge.mqh                                                       |
//| The EA never calls the network. It exchanges files with the      |
//| DisciplineGuard Windows app in the Common Files folder           |
//| (SPEC §9.5):                                                     |
//|   DisciplineGuard\<terminal id>\out.txt  EA → app: "<seq> <path>" |
//|                                          then the JSON body      |
//|   DisciplineGuard\<terminal id>\in.txt   app → EA: "<seq> <code>" |
//|                                          then the response body  |
//|   DisciplineGuard\<terminal id>\app.txt  app heartbeat: unix s,  |
//|                                          state, connection id,   |
//|                                          masked email            |
//|   DisciplineGuard\<terminal id>\ea.txt   EA heartbeat: unix s     |
//| Files are touched only from the timer, never in a click handler. |
//+------------------------------------------------------------------+
#ifndef DG_BRIDGE_MQH
#define DG_BRIDGE_MQH

#define DG_BRIDGE_ROOT       "DisciplineGuard\\"
#define DG_QUIET_AFTER_MS    2000
#define DG_REPLY_TIMEOUT_MS  20000
#define DG_APP_STALE_SEC     90
#define DG_EA_BEAT_MS        15000

string DGBridgeTrim(string s) { StringTrimLeft(s); StringTrimRight(s); return s; }

string DGCommonRead(const string path)
  {
   int h = FileOpen(path, FILE_READ | FILE_BIN | FILE_COMMON | FILE_SHARE_READ | FILE_SHARE_WRITE);
   if(h == INVALID_HANDLE) return "";
   uchar buf[];
   FileReadArray(h, buf);
   FileClose(h);
   return CharArrayToString(buf, 0, WHOLE_ARRAY, CP_UTF8);
  }

/// Writes a temp file and renames it, so the app never reads half a file.
bool DGCommonWrite(const string path, const string text)
  {
   string tmp = path + ".tmp";
   int h = FileOpen(tmp, FILE_WRITE | FILE_BIN | FILE_COMMON | FILE_SHARE_READ);
   if(h == INVALID_HANDLE) return false;
   uchar buf[];
   int n = StringToCharArray(text, buf, 0, WHOLE_ARRAY, CP_UTF8);
   if(n > 0) FileWriteArray(h, buf, 0, n - 1);
   FileClose(h);
   return FileMove(tmp, FILE_COMMON, path, FILE_COMMON | FILE_REWRITE);
  }

/// The terminal id is the name of its data folder, the same name the Windows app finds on disk.
string DGTerminalId()
  {
   string p = TerminalInfoString(TERMINAL_DATA_PATH);
   int cut = 0;
   for(int i = StringLen(p) - 1; i >= 0; i--) if(StringGetCharacter(p, i) == '\\') { cut = i + 1; break; }
   string id = "";
   for(int i = cut; i < StringLen(p); i++)
     {
      ushort c = StringGetCharacter(p, i);
      if((c >= '0' && c <= '9') || (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c == '-' || c == '_') id += ShortToString(c);
     }
   return id;
  }

class DGBridge
  {
public:
   string            dir;
   // app heartbeat
   bool              appAlive;
   string            appState;       // "on" | "signed_out" | "not_protected"
   string            conn;           // connection id the app registered for this terminal
   string            email;          // masked, for display only
   // the one outstanding request
   bool              waiting;
   long              seq;
   string            waitPath;
   ulong             sentTick;
   // quiet periods
   ulong             lastInteraction;
   ulong             lastBeat;

                     DGBridge() { dir = ""; appAlive = false; appState = ""; conn = ""; email = ""; waiting = false; seq = 0; waitPath = ""; sentTick = 0; lastInteraction = 0; lastBeat = 0; }

   void              Init() { dir = DG_BRIDGE_ROOT + DGTerminalId() + "\\"; seq = (long)GetTickCount64(); }

   void              Touch() { lastInteraction = GetTickCount64(); }

   /// Reads the app heartbeat and writes the EA's own. Timer only.
   void              Tick()
     {
      string lines[];
      int n = StringSplit(DGCommonRead(dir + "app.txt"), '\n', lines);
      long ts = n > 0 ? StringToInteger(lines[0]) : 0;
      appAlive = ts > 0 && MathAbs((long)TimeGMT() - ts) <= DG_APP_STALE_SEC;
      appState = n > 1 ? DGBridgeTrim(lines[1]) : "";
      conn = n > 2 ? DGBridgeTrim(lines[2]) : "";
      email = n > 3 ? DGBridgeTrim(lines[3]) : "";
      if(GetTickCount64() - lastBeat >= DG_EA_BEAT_MS)
        {
         lastBeat = GetTickCount64();
         DGCommonWrite(dir + "ea.txt", IntegerToString((long)TimeGMT()));
        }
     }

   /// True when a request may be sent now.
   bool              MayCall()
     {
      if(waiting || !appAlive) return false;
      return GetTickCount64() - lastInteraction >= DG_QUIET_AFTER_MS;
     }

   /// Hands one request to the app. The reply arrives through Poll().
   bool              Send(const string path, const string json)
     {
      if(waiting) return false;
      seq++;
      if(!DGCommonWrite(dir + "out.txt", IntegerToString(seq) + " " + path + "\n" + json)) return false;
      waiting = true;
      waitPath = path;
      sentTick = GetTickCount64();
      return true;
     }

   /// Fire and forget, for OnDeinit: the app still sends it after the chart is gone.
   void              SendLast(const string path, const string json)
     {
      waiting = false;
      Send(path, json);
     }

   /// Returns true when the outstanding request finished: code is the HTTP status, or -1 when the app didn't answer.
   bool              Poll(string &path, int &code, string &resp)
     {
      if(!waiting) return false;
      string txt = DGCommonRead(dir + "in.txt");
      if(txt != "")
        {
         int nl = StringFind(txt, "\n");
         string head = nl >= 0 ? StringSubstr(txt, 0, nl) : txt;
         string parts[];
         if(StringSplit(head, ' ', parts) >= 2 && StringToInteger(parts[0]) == seq)
           {
            FileDelete(dir + "in.txt", FILE_COMMON);
            path = waitPath;
            code = (int)StringToInteger(parts[1]);
            resp = nl >= 0 ? StringSubstr(txt, nl + 1) : "";
            waiting = false;
            return true;
           }
        }
      if(GetTickCount64() - sentTick > DG_REPLY_TIMEOUT_MS)
        {
         FileDelete(dir + "out.txt", FILE_COMMON);
         path = waitPath;
         code = -1;
         resp = "";
         waiting = false;
         return true;
        }
      return false;
     }
  };

#endif
