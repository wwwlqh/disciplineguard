//+------------------------------------------------------------------+
//| Core.mqh                                                         |
//| MQL5 port of packages/core: evaluate() and planPause().          |
//| Must pass the same shared cases (SPEC §15, tests/cases.json).    |
//| Instants are UTC epoch milliseconds. Weekdays: 0 = Monday.       |
//+------------------------------------------------------------------+
#ifndef DG_CORE_MQH
#define DG_CORE_MQH

#include "Json.mqh"

#define DG_MIN   60000
#define DG_HOUR  3600000
#define DG_DAY   86400000
#define DG_EPS   1e-9
#define DG_NONE  LONG_MIN

//--- small helpers -------------------------------------------------
double DGRound8(const double x) { return MathRound(x * 1e8) / 1e8; }

string DGNormSymbol(const string s)
  {
   string u = s;
   StringToUpper(u);
   int i = StringFind(u, ":");
   int last = -1;
   while(i >= 0)
     {
      last = i;
      i = StringFind(u, ":", i + 1);
     }
   return last >= 0 ? StringSubstr(u, last + 1) : u;
  }

bool DGSameInstrument(const string a, const string b)
  {
   string x = DGNormSymbol(a), y = DGNormSymbol(b);
   return StringFind(x, y) == 0 || StringFind(y, x) == 0;
  }

double DGFloorToStep(const double size, const double step)
  {
   if(step <= 0)
      return DGRound8(size);
   return DGRound8(MathFloor(size / step + 1e-9) * step);
  }

long DGFloorDiv(const long a, const long b)
  {
   long q = a / b;
   if((a % b != 0) && ((a < 0) != (b < 0)))
      q--;
   return q;
  }

//--- the model -------------------------------------------------------
class DGModel
  {
public:
   // Rules
   bool              r1On, r2On, r3On, r4On, r5On, r6On, r7On, r8On, r9On, r10On, countOnce;
   int               r1Max, r2Max, r3Count, r3Seconds, r7Minutes, r8RestHours, r10Minutes;
   bool              r7Double, r8All;
   int               wDay[], wStart[], wEnd[];
   // Per-account rules
   string            arId[];
   bool              arHasR5[];
   double            arR5[];
   bool              arHasR6[];
   bool              arR6Pct[];
   double            arR6[];
   bool              arHasR8[];
   bool              arR8Pct[];
   double            arR8[];
   bool              arHasIgnore[];
   double            arIgnore[];
   string            ovAcct[], ovPrefix[];
   double            ovMax[];
   // Time
   long              userResets[];
   string            rsAcct[];
   int               rsStart[], rsLen[];
   long              rsVals[];
   long              offT[];
   int               offS[];
   // State
   long              eT[];
   string            eAcct[], eSym[];
   int               eSide[];
   double            eSize[];
   long              cT[];
   string            cAcct[];
   double            cNet[], cSize[];
   long              oT[];
   long              breakUntil, doneUntil;
   string            sId[], sPlat[];
   bool              sNetting[];
   bool              sHasDsb[], sHasEq[], sHasTv[];
   double            sDsb[], sEq[], sCredit[], sTvLoss[];
   long              sLimitAt[];
   string            pAcct[], pSym[];
   int               pSide[];
   double            pSize[];
   bool              clockVerified;
   long              clockAnchor;
   bool              hasLastSkip;
   long              lsT;
   string            lsSym;
   int               lsSide;
   double            lsWait;
   // Order
   string            oPlat, oAcct, oSym, oKind, oType;
   int               oSide;
   double            oSize;
   bool              oHasSl, oHasPrice, oHasSpec;
   double            oSl, oPrice, oTick, oTickValue, oStep, oMin;
   // Popup
   bool              pShowEvery, pLossOn, pGrowOn, pSkipCard, pKbd;
   int               pWait, pLossSec, pLossMin, pGrowStep, pGrowCap, pTcN;
   string            pTcMode;
   // Output
   string            vRule[];
   double            vObs[], vLim[];
   long              vClears[];
   bool              vHasFix[], vFixSl[];
   double            vFixSize[];
   // Pause plan
   bool              planShow;
   string            planTitle;
   int               planWait, planTypeConfirm, planReattempt, planTradeNumber, planPlaced;

                     DGModel() { Reset(); }

   void              Reset()
     {
      r1On = r2On = r3On = r4On = r5On = r6On = r7On = r8On = r9On = r10On = countOnce = false;
      r1Max = 5; r2Max = 3; r3Count = 3; r3Seconds = 120; r7Minutes = 15; r8RestHours = 12; r10Minutes = 30;
      r7Double = r8All = false;
      ArrayResize(wDay, 0); ArrayResize(wStart, 0); ArrayResize(wEnd, 0);
      ArrayResize(arId, 0); ArrayResize(arHasR5, 0); ArrayResize(arR5, 0); ArrayResize(arHasR6, 0); ArrayResize(arR6Pct, 0);
      ArrayResize(arR6, 0); ArrayResize(arHasR8, 0); ArrayResize(arR8Pct, 0); ArrayResize(arR8, 0); ArrayResize(arHasIgnore, 0); ArrayResize(arIgnore, 0);
      ArrayResize(ovAcct, 0); ArrayResize(ovPrefix, 0); ArrayResize(ovMax, 0);
      ArrayResize(userResets, 0); ArrayResize(rsAcct, 0); ArrayResize(rsStart, 0); ArrayResize(rsLen, 0); ArrayResize(rsVals, 0);
      ArrayResize(offT, 0); ArrayResize(offS, 0);
      ClearState();
      ResetPopup();
     }

   void              ClearState()
     {
      ArrayResize(eT, 0); ArrayResize(eAcct, 0); ArrayResize(eSym, 0); ArrayResize(eSide, 0); ArrayResize(eSize, 0);
      ArrayResize(cT, 0); ArrayResize(cAcct, 0); ArrayResize(cNet, 0); ArrayResize(cSize, 0);
      ArrayResize(oT, 0);
      breakUntil = DG_NONE; doneUntil = DG_NONE;
      ArrayResize(sId, 0); ArrayResize(sPlat, 0); ArrayResize(sNetting, 0); ArrayResize(sHasDsb, 0); ArrayResize(sHasEq, 0);
      ArrayResize(sHasTv, 0); ArrayResize(sDsb, 0); ArrayResize(sEq, 0); ArrayResize(sCredit, 0); ArrayResize(sTvLoss, 0); ArrayResize(sLimitAt, 0);
      ArrayResize(pAcct, 0); ArrayResize(pSym, 0); ArrayResize(pSide, 0); ArrayResize(pSize, 0);
      clockVerified = true; clockAnchor = DG_NONE;
      hasLastSkip = false;
     }

   void              ResetPopup()
     {
      pShowEvery = false; pWait = 5; pLossOn = false; pLossSec = 15; pLossMin = 30; pGrowOn = false; pGrowStep = 5; pGrowCap = 45;
      pTcMode = "off"; pTcN = 3; pSkipCard = true; pKbd = false;
     }

   //--- lookups --------------------------------------------------------
   int               AcctRule(const string id) { for(int i = 0; i < ArraySize(arId); i++) if(arId[i] == id) return i; return -1; }
   int               AcctState(const string id) { for(int i = 0; i < ArraySize(sId); i++) if(sId[i] == id) return i; return -1; }

   int               AddAcctRule(const string id)
     {
      int i = AcctRule(id);
      if(i >= 0) return i;
      i = ArraySize(arId);
      ArrayResize(arId, i + 1); ArrayResize(arHasR5, i + 1); ArrayResize(arR5, i + 1); ArrayResize(arHasR6, i + 1); ArrayResize(arR6Pct, i + 1);
      ArrayResize(arR6, i + 1); ArrayResize(arHasR8, i + 1); ArrayResize(arR8Pct, i + 1); ArrayResize(arR8, i + 1); ArrayResize(arHasIgnore, i + 1); ArrayResize(arIgnore, i + 1);
      arId[i] = id; arHasR5[i] = false; arR5[i] = 0; arHasR6[i] = false; arR6Pct[i] = false; arR6[i] = 0;
      arHasR8[i] = false; arR8Pct[i] = false; arR8[i] = 0; arHasIgnore[i] = false; arIgnore[i] = 0;
      return i;
     }

   int               AddAcctState(const string id, const string platform, const bool netting)
     {
      int i = AcctState(id);
      if(i < 0)
        {
         i = ArraySize(sId);
         ArrayResize(sId, i + 1); ArrayResize(sPlat, i + 1); ArrayResize(sNetting, i + 1); ArrayResize(sHasDsb, i + 1); ArrayResize(sHasEq, i + 1);
         ArrayResize(sHasTv, i + 1); ArrayResize(sDsb, i + 1); ArrayResize(sEq, i + 1); ArrayResize(sCredit, i + 1); ArrayResize(sTvLoss, i + 1); ArrayResize(sLimitAt, i + 1);
        }
      sId[i] = id; sPlat[i] = platform; sNetting[i] = netting; sHasDsb[i] = false; sHasEq[i] = false; sHasTv[i] = false;
      sDsb[i] = 0; sEq[i] = 0; sCredit[i] = 0; sTvLoss[i] = 0; sLimitAt[i] = DG_NONE;
      return i;
     }

   void              AddEntry(const long t, const string acct, const string sym, const int side, const double size)
     {
      int n = ArraySize(eT);
      ArrayResize(eT, n + 1); ArrayResize(eAcct, n + 1); ArrayResize(eSym, n + 1); ArrayResize(eSide, n + 1); ArrayResize(eSize, n + 1);
      eT[n] = t; eAcct[n] = acct; eSym[n] = sym; eSide[n] = side; eSize[n] = size;
     }

   void              AddClose(const long t, const string acct, const double net, const double size)
     {
      int n = ArraySize(cT);
      ArrayResize(cT, n + 1); ArrayResize(cAcct, n + 1); ArrayResize(cNet, n + 1); ArrayResize(cSize, n + 1);
      cT[n] = t; cAcct[n] = acct; cNet[n] = net; cSize[n] = size;
     }

   void              AddOverride(const long t) { int n = ArraySize(oT); ArrayResize(oT, n + 1); oT[n] = t; }

   void              AddPosition(const string acct, const string sym, const int side, const double size)
     {
      int n = ArraySize(pAcct);
      ArrayResize(pAcct, n + 1); ArrayResize(pSym, n + 1); ArrayResize(pSide, n + 1); ArrayResize(pSize, n + 1);
      pAcct[n] = acct; pSym[n] = sym; pSide[n] = side; pSize[n] = size;
     }

   //--- time -----------------------------------------------------------
   void              DayOf(const long &resets[], const long t, long &start, long &end)
     {
      start = LONG_MIN;
      end = LONG_MAX;
      for(int i = 0; i < ArraySize(resets); i++)
        {
         if(resets[i] <= t) start = resets[i];
         else { end = resets[i]; break; }
        }
     }

   long              NextReset(const long &resets[], const long t)
     {
      for(int i = 0; i < ArraySize(resets); i++) if(resets[i] > t) return resets[i];
      return LONG_MAX;
     }

   void              AccountResets(const string acct, long &out[])
     {
      for(int i = 0; i < ArraySize(rsAcct); i++)
         if(rsAcct[i] == acct)
           {
            ArrayResize(out, rsLen[i]);
            for(int j = 0; j < rsLen[i]; j++) out[j] = rsVals[rsStart[i] + j];
            return;
           }
      ArrayCopy(out, userResets);
     }

   int               OffsetAt(const long t)
     {
      if(ArraySize(offT) == 0) return 0;
      int off = offS[0];
      for(int i = 0; i < ArraySize(offT); i++)
        {
         if(offT[i] <= t) off = offS[i];
         else break;
        }
      return off;
     }

   void              LocalParts(const long t, int &weekday, long &msOfDay, long &dayNumber)
     {
      long local = t + (long)OffsetAt(t) * 1000;
      dayNumber = DGFloorDiv(local, DG_DAY);
      msOfDay = local - dayNumber * DG_DAY;
      weekday = (int)((((dayNumber + 3) % 7) + 7) % 7);
     }

   long              LocalToUtc(const long local)
     {
      long guess = local - (long)OffsetAt(local) * 1000;
      return local - (long)OffsetAt(guess) * 1000;
     }

   long              SafeNow(const long now)
     {
      if(clockVerified || clockAnchor == DG_NONE) return now;
      return MathMin(now, clockAnchor);
     }

   //--- counting --------------------------------------------------------
   /// Indices of counted entries, time-sorted, with "count once" duplicates removed (SPEC §4.2).
   void              Counted(int &idx[])
     {
      int n = ArraySize(eT);
      int order[];
      ArrayResize(order, n);
      for(int i = 0; i < n; i++) order[i] = i;
      for(int i = 1; i < n; i++)
        {
         int k = order[i];
         int j = i - 1;
         while(j >= 0 && eT[order[j]] > eT[k]) { order[j + 1] = order[j]; j--; }
         order[j + 1] = k;
        }
      ArrayResize(idx, 0);
      for(int a = 0; a < n; a++)
        {
         int e = order[a];
         bool dup = false;
         if(countOnce)
            for(int b = 0; b < ArraySize(idx) && !dup; b++)
              {
               int c = idx[b];
               if(eAcct[c] != eAcct[e] && eSide[c] == eSide[e] && eT[e] - eT[c] <= 60000 && DGSameInstrument(eSym[c], eSym[e]))
                  dup = true;
              }
         if(!dup) { int m = ArraySize(idx); ArrayResize(idx, m + 1); idx[m] = e; }
        }
     }

   int               EntriesToday(const long t)
     {
      long start, end;
      DayOf(userResets, t, start, end);
      int idx[];
      Counted(idx);
      int n = 0;
      for(int i = 0; i < ArraySize(idx); i++) if(eT[idx[i]] >= start && eT[idx[i]] < end && eT[idx[i]] <= t) n++;
      return n;
     }

   int               PlacedAnywayCount(const long t)
     {
      long start, end;
      DayOf(userResets, t, start, end);
      int n = 0;
      for(int i = 0; i < ArraySize(oT); i++) if(oT[i] >= start && oT[i] < end && oT[i] <= t) n++;
      return n;
     }

   //--- closes and cooldown (R7, R10) ---------------------------------
   void              SortedCloses(int &idx[])
     {
      int n = ArraySize(cT);
      ArrayResize(idx, n);
      for(int i = 0; i < n; i++) idx[i] = i;
      for(int i = 1; i < n; i++)
        {
         int k = idx[i];
         int j = i - 1;
         while(j >= 0 && cT[idx[j]] > cT[k]) { idx[j + 1] = idx[j]; j--; }
         idx[j + 1] = k;
        }
     }

   void              Qualifying(int &q[])
     {
      int all[];
      SortedCloses(all);
      ArrayResize(q, 0);
      for(int i = 0; i < ArraySize(all); i++)
        {
         int c = all[i];
         if(cNet[c] < 0)
           {
            int ar = AcctRule(cAcct[c]);
            if(ar >= 0 && arHasIgnore[ar] && MathAbs(cNet[c]) < arIgnore[ar]) continue;
           }
         int m = ArraySize(q);
         ArrayResize(q, m + 1);
         q[m] = c;
        }
     }

   long              CooldownAfter(const int &q[], const int i)
     {
      bool doubled = r7Double && i > 0 && cNet[q[i - 1]] < 0;
      return (long)r7Minutes * DG_MIN * (doubled ? 2 : 1);
     }

   /// Latest qualifying losing close at or before t. Returns its index in cT, or -1.
   int               ActiveCooldown(const long t, long &until)
     {
      int q[];
      Qualifying(q);
      int last = -1;
      for(int i = 0; i < ArraySize(q); i++) if(cT[q[i]] <= t) last = i;
      for(int i = last; i >= 0; i--)
         if(cNet[q[i]] < 0)
           {
            int qq[];
            ArrayResize(qq, i + 1);
            for(int k = 0; k <= i; k++) qq[k] = q[k];
            until = cT[q[i]] + CooldownAfter(qq, i);
            return q[i];
           }
      return -1;
     }

   //--- R8 ---------------------------------------------------------------
   bool              AccountLoss(const int s, double &loss)
     {
      if(s < 0) return false;
      if(sPlat[s] == "tv") { if(!sHasTv[s]) return false; loss = sTvLoss[s]; return true; }
      if(!sHasDsb[s] || !sHasEq[s]) return false;
      loss = DGRound8(sDsb[s] - (sEq[s] - sCredit[s]));
      return true;
     }

   bool              R8Status(const string acct, const long t, bool &inLimit, double &loss, double &limit, long &until)
     {
      inLimit = false; loss = 0; limit = 0; until = DG_NONE;
      int ar = AcctRule(acct);
      int s = AcctState(acct);
      if(!r8On || ar < 0 || !arHasR8[ar] || s < 0) return false;
      bool hasLoss = AccountLoss(s, loss);
      if(!arR8Pct[ar]) limit = arR8[ar];
      else
        {
         if(sPlat[s] == "tv" || !sHasDsb[s]) return false;
         limit = DGRound8(arR8[ar] * sDsb[s] / 100.0);
        }
      long resets[];
      AccountResets(acct, resets);
      long rest = (long)r8RestHours * DG_HOUR;
      if(sLimitAt[s] != DG_NONE)
        {
         long u = MathMax(NextReset(resets, sLimitAt[s]), sLimitAt[s] + rest);
         if(t < u) { inLimit = true; until = u; if(!hasLoss) loss = 0; return true; }
        }
      if(!hasLoss) return false;
      if(loss >= limit - DG_EPS)
        {
         inLimit = true;
         until = MathMax(NextReset(resets, t), t + rest);
        }
      return true;
     }

   //--- R4 ---------------------------------------------------------------
   bool              InsideWindows(const long t)
     {
      int wd; long ms, dn;
      LocalParts(t, wd, ms, dn);
      for(int i = 0; i < ArraySize(wDay); i++)
         if(wDay[i] == wd && ms >= (long)wStart[i] * DG_MIN && ms < (long)wEnd[i] * DG_MIN) return true;
      return false;
     }

   long              NextWindowStart(const long t)
     {
      int wd; long ms, dn;
      LocalParts(t, wd, ms, dn);
      long best = DG_NONE;
      for(int d = 0; d <= 8; d++)
        {
         long day = dn + d;
         int weekday = (int)((((day + 3) % 7) + 7) % 7);
         for(int i = 0; i < ArraySize(wDay); i++)
           {
            if(wDay[i] != weekday) continue;
            long at = LocalToUtc(day * DG_DAY + (long)wStart[i] * DG_MIN);
            if(at > t && (best == DG_NONE || at < best)) best = at;
           }
         if(best != DG_NONE) break;
        }
      return best;
     }

   //--- positions and classification ---------------------------------
   double            PositionSize(const string acct, const string sym, const int side)
     {
      double total = 0;
      for(int i = 0; i < ArraySize(pAcct); i++)
         if(pAcct[i] == acct && pSide[i] == side && DGSameInstrument(pSym[i], sym)) total += pSize[i];
      return total;
     }

   /// Classifies a panel order. positionsKnown=false for TradingView before any read.
   string            Classify(const string acct, const string platform, const bool netting, const string sym, const int side, const double size,
                              const bool positionsKnown, double &resulting, double &newSize, bool &reversal)
     {
      reversal = false;
      if(platform != "tv" && !netting)
        {
         resulting = PositionSize(acct, sym, side) + size;
         newSize = size;
         return "entry";
        }
      if(!positionsKnown) { resulting = size; newSize = size; return "unclassified"; }
      double same = PositionSize(acct, sym, side);
      double opp = PositionSize(acct, sym, -side);
      if(opp == 0) { resulting = same + size; newSize = size; return "entry"; }
      if(size <= opp + 1e-9) { resulting = 0; newSize = 0; return "exit"; }
      double rev = DGRound8(size - opp);
      resulting = rev; newSize = rev; reversal = true;
      return "entry";
     }

   bool              EffectiveR5(const string acct, const string sym, double &limit)
     {
      int ar = AcctRule(acct);
      if(ar < 0 || !arHasR5[ar]) return false;
      string s = DGNormSymbol(sym);
      int bestLen = -1;
      limit = arR5[ar];
      for(int i = 0; i < ArraySize(ovAcct); i++)
        {
         if(ovAcct[i] != acct) continue;
         string p = ovPrefix[i];
         StringToUpper(p);
         if(StringFind(s, p) == 0 && StringLen(p) > bestLen) { bestLen = StringLen(p); limit = ovMax[i]; }
        }
      return true;
     }

   //--- output -----------------------------------------------------------
   void              ClearViolations()
     {
      ArrayResize(vRule, 0); ArrayResize(vObs, 0); ArrayResize(vLim, 0); ArrayResize(vClears, 0);
      ArrayResize(vHasFix, 0); ArrayResize(vFixSl, 0); ArrayResize(vFixSize, 0);
     }

   void              Push(const string rule, const double obs, const double lim, const long clears, const bool hasFixSize, const double fixSize, const bool fixSl)
     {
      int n = ArraySize(vRule);
      ArrayResize(vRule, n + 1); ArrayResize(vObs, n + 1); ArrayResize(vLim, n + 1); ArrayResize(vClears, n + 1);
      ArrayResize(vHasFix, n + 1); ArrayResize(vFixSl, n + 1); ArrayResize(vFixSize, n + 1);
      vRule[n] = rule; vObs[n] = obs; vLim[n] = lim; vClears[n] = clears; vHasFix[n] = hasFixSize; vFixSize[n] = fixSize; vFixSl[n] = fixSl;
     }

   int               Priority(const string r)
     {
      string p[] = {"DONE_TODAY", "BREAK", "R8", "R7", "R10", "R1", "R2", "R3", "R4", "R6", "R5", "R9"};
      for(int i = 0; i < ArraySize(p); i++) if(p[i] == r) return i;
      return 99;
     }

   void              SortViolations()
     {
      int n = ArraySize(vRule);
      for(int i = 1; i < n; i++)
         for(int j = i; j > 0 && Priority(vRule[j - 1]) > Priority(vRule[j]); j--)
           {
            string r = vRule[j]; vRule[j] = vRule[j - 1]; vRule[j - 1] = r;
            double o = vObs[j]; vObs[j] = vObs[j - 1]; vObs[j - 1] = o;
            double l = vLim[j]; vLim[j] = vLim[j - 1]; vLim[j - 1] = l;
            long c = vClears[j]; vClears[j] = vClears[j - 1]; vClears[j - 1] = c;
            bool h = vHasFix[j]; vHasFix[j] = vHasFix[j - 1]; vHasFix[j - 1] = h;
            bool f = vFixSl[j]; vFixSl[j] = vFixSl[j - 1]; vFixSl[j - 1] = f;
            double z = vFixSize[j]; vFixSize[j] = vFixSize[j - 1]; vFixSize[j - 1] = z;
           }
     }

   //--- evaluate (SPEC §8.1) -----------------------------------------
   void              Evaluate(const long now)
     {
      ClearViolations();
      if(oKind != "entry") return;
      long t = SafeNow(now);
      int s = AcctState(oAcct);
      bool netting = s >= 0 ? sNetting[s] : false;
      string platform = s >= 0 ? sPlat[s] : oPlat;
      double resulting, newSize;
      bool reversal;
      Classify(oAcct, platform, netting, oSym, oSide, oSize, true, resulting, newSize, reversal);
      int ar = AcctRule(oAcct);

      if(doneUntil != DG_NONE && t < doneUntil) Push("DONE_TODAY", 0, 0, doneUntil, false, 0, false);
      if(breakUntil != DG_NONE && t < breakUntil) Push("BREAK", 0, 0, breakUntil, false, 0, false);

      if(r8On)
        {
         bool inL; double loss, lim; long until;
         R8Status(oAcct, t, inL, loss, lim, until);
         if(inL) Push("R8", loss, lim, until, false, 0, false);
         else if(r8All)
            for(int i = 0; i < ArraySize(sId); i++)
              {
               if(sId[i] == oAcct) continue;
               bool il; double l2, lim2; long u2;
               R8Status(sId[i], t, il, l2, lim2, u2);
               if(il) { Push("R8", l2, lim2, u2, false, 0, false); break; }
              }
        }

      if(r7On)
        {
         long until;
         int c = ActiveCooldown(t, until);
         if(c >= 0 && t < until) Push("R7", (double)((t - cT[c]) / DG_MIN), (double)(until - cT[c]) / DG_MIN, until, false, 0, false);
        }

      if(r10On)
        {
         int all[];
         SortedCloses(all);
         int last = -1;
         for(int i = 0; i < ArraySize(all); i++)
           {
            int c = all[i];
            if(cAcct[c] == oAcct && cNet[c] < 0 && cT[c] <= t) last = c;
           }
         if(last >= 0 && cSize[last] > 0)
           {
            int q[];
            Qualifying(q);
            int qi = -1;
            for(int i = 0; i < ArraySize(q); i++) if(q[i] == last) qi = i;
            long start = cT[last];
            if(r7On && qi >= 0)
              {
               int qq[];
               ArrayResize(qq, qi + 1);
               for(int k = 0; k <= qi; k++) qq[k] = q[k];
               start = cT[last] + CooldownAfter(qq, qi);
              }
            long end = start + (long)r10Minutes * DG_MIN;
            if(t >= start && t < end && newSize > cSize[last] + DG_EPS) Push("R10", newSize, cSize[last], end, true, cSize[last], false);
           }
        }

      // R1–R3 count user-wide.
      int idx[];
      Counted(idx);
      int cnt[];
      for(int i = 0; i < ArraySize(idx); i++)
         if(eT[idx[i]] <= t) { int m = ArraySize(cnt); ArrayResize(cnt, m + 1); cnt[m] = idx[i]; }
      bool matches = false;
      if(countOnce)
         for(int i = 0; i < ArraySize(cnt) && !matches; i++)
           {
            int c = cnt[i];
            if(eAcct[c] != oAcct && eSide[c] == oSide && t - eT[c] <= 60000 && DGSameInstrument(eSym[c], oSym)) matches = true;
           }
      if(!matches)
        {
         if(r1On)
           {
            long start, end;
            DayOf(userResets, t, start, end);
            int n = 0;
            for(int i = 0; i < ArraySize(cnt); i++) if(eT[cnt[i]] >= start && eT[cnt[i]] < end) n++;
            if(n >= r1Max) Push("R1", n + 1, r1Max, end, false, 0, false);
           }
         if(r2On || r3On)
           {
            // Times in each window, newest first.
            long times[];
            ArrayResize(times, ArraySize(cnt));
            for(int i = 0; i < ArraySize(cnt); i++) times[i] = eT[cnt[i]];
            ArraySort(times);
            if(r2On)
              {
               long inWin[];
               for(int i = ArraySize(times) - 1; i >= 0; i--) if(times[i] > t - DG_HOUR) { int m = ArraySize(inWin); ArrayResize(inWin, m + 1); inWin[m] = times[i]; }
               if(ArraySize(inWin) >= r2Max) Push("R2", ArraySize(inWin) + 1, r2Max, inWin[r2Max - 1] + DG_HOUR, false, 0, false);
              }
            if(r3On)
              {
               long ms = (long)r3Seconds * 1000;
               long inWin[];
               for(int i = ArraySize(times) - 1; i >= 0; i--) if(times[i] > t - ms) { int m = ArraySize(inWin); ArrayResize(inWin, m + 1); inWin[m] = times[i]; }
               int need = r3Count - 1;
               if(need >= 1 && ArraySize(inWin) >= need) Push("R3", ArraySize(inWin) + 1, r3Count, inWin[need - 1] + ms, false, 0, false);
              }
           }
        }

      if(r4On && !InsideWindows(now)) Push("R4", 0, 0, NextWindowStart(now), false, 0, false);

      if(r6On && oPlat != "tv" && ar >= 0 && arHasR6[ar])
        {
         if(!oHasSl) Push("R6", 0, 0, DG_NONE, false, 0, true);
         else if(oHasPrice && oHasSpec && oTick > 0)
           {
            double ticks = MathRound(MathAbs(oPrice - oSl) / oTick * 1e6) / 1e6;
            double perLot = ticks * oTickValue;
            double risk = MathRound(perLot * newSize * 100) / 100;
            bool hasLimit = true;
            double limit = arR6[ar];
            if(arR6Pct[ar])
              {
               if(s >= 0 && sHasDsb[s]) limit = DGRound8(arR6[ar] * sDsb[s] / 100.0);
               else hasLimit = false;
              }
            if(hasLimit && risk > limit + DG_EPS)
              {
               double fit = perLot > 0 ? DGFloorToStep(limit / perLot, oStep) : 0;
               Push("R6", risk, limit, DG_NONE, true, fit, false);
              }
           }
        }

      if(r5On)
        {
         double limit;
         if(EffectiveR5(oAcct, oSym, limit) && resulting > limit + DG_EPS)
           {
            double opp = PositionSize(oAcct, oSym, -oSide);
            double same = PositionSize(oAcct, oSym, oSide);
            double raw = reversal ? opp + limit : limit - same;
            double fix = oHasSpec && oStep > 0 ? DGFloorToStep(raw, oStep) : DGRound8(raw);
            Push("R5", resulting, limit, DG_NONE, true, MathMax(0, fix), false);
           }
        }

      if(r9On && !oHasSl) Push("R9", 0, 0, DG_NONE, false, 0, true);
      SortViolations();
     }

   //--- planPause (SPEC §7.2) ---------------------------------------
   void              PlanPause(const long now)
     {
      planShow = false;
      if(oKind != "entry") return;
      if(ArraySize(vRule) == 0 && !pShowEvery) return;
      planShow = true;
      long t = SafeNow(now);
      int count = PlacedAnywayCount(t);
      int wait = pWait;
      if(pLossOn)
        {
         long lastLoss = LONG_MIN;
         for(int i = 0; i < ArraySize(cT); i++) if(cNet[i] < 0 && cT[i] <= t && cT[i] > lastLoss) lastLoss = cT[i];
         if(lastLoss != LONG_MIN && t - lastLoss < (long)pLossMin * DG_MIN) wait = MathMax(wait, pLossSec);
        }
      if(pGrowOn)
        {
         int grown = wait + pGrowStep * count;
         wait = MathMin(grown, MathMax(pGrowCap, wait));
        }
      planTitle = ArraySize(vRule) > 0 ? vRule[0] : "CHECK";
      if(planTitle == "BREAK" || planTitle == "DONE_TODAY") wait = MathMax(wait, 15);
      planReattempt = -1;
      if(hasLastSkip && lsSide == oSide && DGSameInstrument(lsSym, oSym) && t - lsT <= 180000 && t >= lsT)
        {
         planReattempt = (int)MathRound((t - lsT) / 1000.0);
         wait = MathMax(wait, (int)lsWait);
        }
      planTradeNumber = EntriesToday(t) + 1;
      planPlaced = count;
      planTypeConfirm = (pTcMode == "always" || (pTcMode == "after" && count >= pTcN)) ? planTradeNumber : -1;
      planWait = MathMax(0, MathMin(wait, 180));
     }

   //--- loading from JSON (same shapes as packages/core types) --------
   bool              On(DGJson &j, const int rules, const string id) { return j.Bool(j.Path(rules, id + ".on")); }

   void              LoadRules(DGJson &j, const int r)
     {
      r1On = On(j, r, "R1"); r1Max = (int)j.Long(j.Path(r, "R1.max"), 5);
      r2On = On(j, r, "R2"); r2Max = (int)j.Long(j.Path(r, "R2.max"), 3);
      r3On = On(j, r, "R3"); r3Count = (int)j.Long(j.Path(r, "R3.count"), 3); r3Seconds = (int)j.Long(j.Path(r, "R3.seconds"), 120);
      r4On = On(j, r, "R4");
      int w = j.Path(r, "R4.windows");
      int nw = j.Size(w);
      ArrayResize(wDay, nw); ArrayResize(wStart, nw); ArrayResize(wEnd, nw);
      int k = 0;
      for(int c = j.First(w); c >= 0; c = j.Next(c), k++)
        {
         wDay[k] = (int)j.Long(j.Get(c, "day"));
         wStart[k] = (int)j.Long(j.Get(c, "start"));
         wEnd[k] = (int)j.Long(j.Get(c, "end"));
        }
      r5On = On(j, r, "R5"); r6On = On(j, r, "R6");
      r7On = On(j, r, "R7"); r7Minutes = (int)j.Long(j.Path(r, "R7.minutes"), 15); r7Double = j.Bool(j.Path(r, "R7.doubleAfter2"));
      r8On = On(j, r, "R8"); r8RestHours = (int)j.Long(j.Path(r, "R8.restHours"), 12); r8All = j.Bool(j.Path(r, "R8.allAccounts"));
      r9On = On(j, r, "R9");
      r10On = On(j, r, "R10"); r10Minutes = (int)j.Long(j.Path(r, "R10.minutes"), 30);
      countOnce = j.Bool(j.Get(r, "countOnce"));
      ArrayResize(arId, 0);
      ArrayResize(ovAcct, 0); ArrayResize(ovPrefix, 0); ArrayResize(ovMax, 0);
      int accts = j.Get(r, "accounts");
      for(int a = j.First(accts); a >= 0; a = j.Next(a))
        {
         int i = AddAcctRule(j.Key(a));
         int v = j.Get(a, "r5Max");
         if(j.Valid(v)) { arHasR5[i] = true; arR5[i] = j.Num(v); }
         int ov = j.Get(a, "r5Overrides");
         for(int o = j.First(ov); o >= 0; o = j.Next(o))
           {
            int m = ArraySize(ovAcct);
            ArrayResize(ovAcct, m + 1); ArrayResize(ovPrefix, m + 1); ArrayResize(ovMax, m + 1);
            ovAcct[m] = arId[i]; ovPrefix[m] = j.Str(j.Get(o, "prefix")); ovMax[m] = j.Num(j.Get(o, "max"));
           }
         int r6 = j.Get(a, "r6");
         if(j.Valid(r6)) { arHasR6[i] = true; arR6Pct[i] = j.Str(j.Get(r6, "unit")) == "pct"; arR6[i] = j.Num(j.Get(r6, "value")); }
         int r8 = j.Get(a, "r8");
         if(j.Valid(r8)) { arHasR8[i] = true; arR8Pct[i] = j.Str(j.Get(r8, "unit")) == "pct"; arR8[i] = j.Num(j.Get(r8, "value")); }
         int ig = j.Get(a, "r7IgnoreBelow");
         if(j.Valid(ig)) { arHasIgnore[i] = true; arIgnore[i] = j.Num(ig); }
        }
     }

   void              LoadLongs(DGJson &j, const int arr, long &out[])
     {
      ArrayResize(out, j.Size(arr));
      int k = 0;
      for(int c = j.First(arr); c >= 0; c = j.Next(c), k++) out[k] = j.Long(c);
     }

   void              LoadTime(DGJson &j, const int t)
     {
      LoadLongs(j, j.Get(t, "userResets"), userResets);
      ArrayResize(rsAcct, 0); ArrayResize(rsStart, 0); ArrayResize(rsLen, 0); ArrayResize(rsVals, 0);
      int ar = j.Get(t, "accountResets");
      for(int a = j.First(ar); a >= 0; a = j.Next(a))
        {
         int m = ArraySize(rsAcct);
         ArrayResize(rsAcct, m + 1); ArrayResize(rsStart, m + 1); ArrayResize(rsLen, m + 1);
         rsAcct[m] = j.Key(a);
         rsStart[m] = ArraySize(rsVals);
         rsLen[m] = j.Size(a);
         for(int c = j.First(a); c >= 0; c = j.Next(c)) { int v = ArraySize(rsVals); ArrayResize(rsVals, v + 1); rsVals[v] = j.Long(c); }
        }
      int off = j.Get(t, "offsets");
      ArrayResize(offT, j.Size(off)); ArrayResize(offS, j.Size(off));
      int k = 0;
      for(int c = j.First(off); c >= 0; c = j.Next(c), k++) { offT[k] = j.Long(j.At(c, 0)); offS[k] = (int)j.Long(j.At(c, 1)); }
     }

   int               Side(const string s) { return s == "sell" ? -1 : 1; }

   void              LoadState(DGJson &j, const int s)
     {
      ClearState();
      int en = j.Get(s, "entries");
      for(int c = j.First(en); c >= 0; c = j.Next(c))
         AddEntry(j.Long(j.Get(c, "t")), j.Str(j.Get(c, "account")), j.Str(j.Get(c, "symbol")), Side(j.Str(j.Get(c, "side"))), j.Num(j.Get(c, "size")));
      int cl = j.Get(s, "closes");
      for(int c = j.First(cl); c >= 0; c = j.Next(c))
         AddClose(j.Long(j.Get(c, "t")), j.Str(j.Get(c, "account")), j.Num(j.Get(c, "net")), j.Num(j.Get(c, "size")));
      int ov = j.Get(s, "overrides");
      for(int c = j.First(ov); c >= 0; c = j.Next(c)) AddOverride(j.Long(c));
      if(j.Valid(j.Get(s, "breakUntil"))) breakUntil = j.Long(j.Get(s, "breakUntil"));
      if(j.Valid(j.Get(s, "doneUntil"))) doneUntil = j.Long(j.Get(s, "doneUntil"));
      int ac = j.Get(s, "accounts");
      for(int a = j.First(ac); a >= 0; a = j.Next(a))
        {
         int i = AddAcctState(j.Key(a), j.Str(j.Get(a, "platform"), "mt5"), j.Bool(j.Get(a, "netting")));
         int v = j.Get(a, "dayStartBalance"); if(j.Valid(v)) { sHasDsb[i] = true; sDsb[i] = j.Num(v); }
         v = j.Get(a, "equity"); if(j.Valid(v)) { sHasEq[i] = true; sEq[i] = j.Num(v); }
         v = j.Get(a, "credit"); if(j.Valid(v)) sCredit[i] = j.Num(v);
         v = j.Get(a, "tvLoss"); if(j.Valid(v)) { sHasTv[i] = true; sTvLoss[i] = j.Num(v); }
         v = j.Get(a, "limitReachedAt"); if(j.Valid(v)) sLimitAt[i] = j.Long(v);
         int ps = j.Get(a, "positions");
         for(int p = j.First(ps); p >= 0; p = j.Next(p))
            AddPosition(sId[i], j.Str(j.Get(p, "symbol")), Side(j.Str(j.Get(p, "side"))), j.Num(j.Get(p, "size")));
        }
      int ck = j.Get(s, "clock");
      clockVerified = j.Bool(j.Get(ck, "verified"), true);
      if(j.Valid(j.Get(ck, "anchor"))) clockAnchor = j.Long(j.Get(ck, "anchor"));
      int ls = j.Get(s, "lastSkip");
      if(j.Valid(ls))
        {
         hasLastSkip = true;
         lsT = j.Long(j.Get(ls, "t")); lsSym = j.Str(j.Get(ls, "symbol")); lsSide = Side(j.Str(j.Get(ls, "side"))); lsWait = j.Num(j.Get(ls, "waitSec"));
        }
     }

   void              LoadOrder(DGJson &j, const int o)
     {
      oPlat = j.Str(j.Get(o, "platform"), "mt5");
      oAcct = j.Str(j.Get(o, "account"));
      oSym = j.Str(j.Get(o, "symbol"));
      oSide = Side(j.Str(j.Get(o, "side")));
      oSize = j.Num(j.Get(o, "size"));
      oType = j.Str(j.Get(o, "type"), "market");
      oKind = j.Str(j.Get(o, "kind"), "entry");
      int v = j.Get(o, "sl"); oHasSl = j.Valid(v); oSl = j.Num(v);
      v = j.Get(o, "price"); oHasPrice = j.Valid(v); oPrice = j.Num(v);
      int sp = j.Get(o, "spec");
      oHasSpec = j.Valid(sp);
      oTick = j.Num(j.Get(sp, "tickSize")); oTickValue = j.Num(j.Get(sp, "tickValueLoss"));
      oStep = j.Num(j.Get(sp, "volumeStep")); oMin = j.Num(j.Get(sp, "volumeMin"));
     }

   void              LoadPopup(DGJson &j, const int p)
     {
      ResetPopup();
      if(!j.Valid(p)) return;
      pShowEvery = j.Str(j.Get(p, "show")) == "every";
      pWait = (int)j.Long(j.Get(p, "wait"), 5);
      pLossOn = j.Bool(j.Path(p, "lossWait.on")); pLossSec = (int)j.Long(j.Path(p, "lossWait.seconds"), 15); pLossMin = (int)j.Long(j.Path(p, "lossWait.withinMinutes"), 30);
      pGrowOn = j.Bool(j.Path(p, "growing.on")); pGrowStep = (int)j.Long(j.Path(p, "growing.step"), 5); pGrowCap = (int)j.Long(j.Path(p, "growing.cap"), 45);
      pTcMode = j.Str(j.Path(p, "typeConfirm.mode"), "off"); pTcN = (int)j.Long(j.Path(p, "typeConfirm.n"), 3);
      pSkipCard = j.Bool(j.Get(p, "skipCard"), true); pKbd = j.Bool(j.Get(p, "keyboardPlace"));
     }
  };

#endif
