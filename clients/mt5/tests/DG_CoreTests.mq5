//+------------------------------------------------------------------+
//| DG_CoreTests.mq5                                                 |
//| Runs the shared cases (MQL5\Files\dg_cases.json) through the     |
//| MQL5 evaluate() and planPause(), and writes dg_results.json.     |
//| tests/compare.ts diffs it against the TypeScript engine.         |
//| An EA, not a script: scripts wait for chart data.                |
//+------------------------------------------------------------------+
#property strict
#include "../DG/Core.mqh"

string ReadAll(const string name)
  {
   int h = FileOpen(name, FILE_READ | FILE_BIN);
   if(h == INVALID_HANDLE)
      return "";
   uchar buf[];
   FileReadArray(h, buf);
   FileClose(h);
   return CharArrayToString(buf, 0, WHOLE_ARRAY, CP_UTF8);
  }

void Run()
  {
   string text = ReadAll("dg_cases.json");
   DGJson j;
   ulong t0 = GetMicrosecondCount();
   if(!j.Parse(text))
     {
      Print("DG tests: cannot parse dg_cases.json (", StringLen(text), " chars)");
      return;
     }
   ulong parseUs = GetMicrosecondCount() - t0;
   DGJsonWriter w;
   w.BeginObj();
   w.Long("parseUs", (long)parseUs);
   w.BeginArr("results");
   int n = 0;
   ulong evalUs = 0;
   for(int c = j.First(j.Root()); c >= 0; c = j.Next(c), n++)
     {
      DGModel m;
      int in = j.Get(c, "input");
      m.LoadRules(j, j.Get(in, "rules"));
      m.LoadTime(j, j.Get(in, "time"));
      m.LoadState(j, j.Get(in, "state"));
      m.LoadOrder(j, j.Get(in, "order"));
      long now = j.Long(j.Get(in, "now"));
      int popup = j.Get(c, "popup");
      ulong e0 = GetMicrosecondCount();
      m.Evaluate(now);
      if(j.Valid(popup))
        {
         m.LoadPopup(j, popup);
         m.PlanPause(now);
        }
      evalUs += GetMicrosecondCount() - e0;
      w.BeginObj();
      w.Str("id", j.Str(j.Get(c, "id")));
      w.BeginArr("violations");
      for(int i = 0; i < ArraySize(m.vRule); i++)
        {
         w.BeginObj();
         w.Str("rule", m.vRule[i]);
         w.Num("observed", m.vObs[i]);
         w.Num("limit", m.vLim[i]);
         if(m.vClears[i] != DG_NONE) w.Long("clearsAt", m.vClears[i]);
         if(m.vHasFix[i]) w.Num("fixSize", m.vFixSize[i]);
         if(m.vFixSl[i]) w.Bool("fixAddSl", true);
         w.EndObj();
        }
      w.EndArr();
      if(j.Valid(popup))
        {
         if(m.planShow)
           {
            w.BeginObj("plan");
            w.Str("title", m.planTitle);
            w.Long("waitSec", m.planWait);
            if(m.planTypeConfirm >= 0) w.Long("typeConfirm", m.planTypeConfirm);
            if(m.planReattempt >= 0) w.Long("reattemptAgoSec", m.planReattempt);
            w.Long("tradeNumber", m.planTradeNumber);
            w.Long("placedAnyway", m.planPlaced);
            w.EndObj();
           }
         else
            w.Null("plan");
        }
      w.EndObj();
     }
   w.EndArr();
   w.Long("evalUs", (long)evalUs);
   w.EndObj();
   int h = FileOpen("dg_results.json", FILE_WRITE | FILE_BIN);
   if(h != INVALID_HANDLE)
     {
      uchar out[];
      int len = StringToCharArray(w.Text(), out, 0, WHOLE_ARRAY, CP_UTF8) - 1;
      FileWriteArray(h, out, 0, len);
      FileClose(h);
     }
   Print("DG tests: ", n, " cases, parse ", parseUs, " us, evaluate ", evalUs, " us");
  }

int OnInit() { EventSetTimer(1); return INIT_SUCCEEDED; }
void OnTimer() { EventKillTimer(); Run(); ExpertRemove(); }
void OnDeinit(const int reason) { EventKillTimer(); }
