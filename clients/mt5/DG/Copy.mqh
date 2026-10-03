//+------------------------------------------------------------------+
//| Copy.mqh                                                         |
//| Pause and status wording (EXPERIENCE §9.2), the same words as    |
//| packages/core/src/copy.ts. Times use the user timezone offsets   |
//| from the signed cache, never the terminal's clock zone.          |
//+------------------------------------------------------------------+
#ifndef DG_COPY_MQH
#define DG_COPY_MQH

#include "Core.mqh"

string DGDays[] = {"Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"};

/// "10:14" today, "Tue 02:00" another day.
string DGFmtTime(DGModel &m, const long t, const long now)
  {
   if(t == DG_NONE || t == LONG_MAX) return "—";
   int wd; long ms, dn;
   m.LocalParts(t, wd, ms, dn);
   int wd2; long ms2, dn2;
   m.LocalParts(now, wd2, ms2, dn2);
   string hm = StringFormat("%02d:%02d", (int)(ms / 3600000), (int)((ms / 60000) % 60));
   return dn == dn2 ? hm : DGDays[wd] + " " + hm;
  }

string DGFmtLots(const double x) { return x >= 100 ? DoubleToString(x, 0) : DoubleToString(x, 2); }

bool DGHideAmounts = false;

string DGFmtMoney(const double x, const bool signedValue = false)
  {
   if(DGHideAmounts) return "—";
   string cur = AccountInfoString(ACCOUNT_CURRENCY);
   string sym = cur == "USD" ? "$" : (cur == "EUR" ? "€" : (cur == "GBP" ? "£" : ""));
   double a = MathAbs(x);
   string num = (a == MathRound(a)) ? DoubleToString(a, 0) : DoubleToString(a, 2);
   string body = sym != "" ? sym + num : num + " " + cur;
   if(!signedValue) return body;
   return (x < 0 ? "−" : (x > 0 ? "+" : "")) + body;
  }

string DGOrdinal(const int n)
  {
   int v = n % 100;
   string s = "th";
   if(v < 11 || v > 13)
     {
      if(n % 10 == 1) s = "st";
      else if(n % 10 == 2) s = "nd";
      else if(n % 10 == 3) s = "rd";
     }
   return IntegerToString(n) + s;
  }

string DGRuleName(const string r)
  {
   if(r == "R1") return "Max trades per day";
   if(r == "R2") return "Max trades per hour";
   if(r == "R3") return "Too fast";
   if(r == "R4") return "Trading hours";
   if(r == "R5") return "Max position size";
   if(r == "R6") return "Max risk per trade";
   if(r == "R7") return "Cooldown after a loss";
   if(r == "R8") return "Daily loss limit";
   if(r == "R9") return "Stop loss required";
   if(r == "R10") return "No bigger after a loss";
   if(r == "BREAK") return "Break";
   if(r == "DONE_TODAY") return "Done for today";
   return "Check your plan";
  }

/// The headline for violation i (or the "every entry" headline when there is none).
string DGHeadline(DGModel &m, const int i, const long now)
  {
   if(i < 0 || i >= ArraySize(m.vRule)) return "Check your plan before this trade.";
   string r = m.vRule[i];
   if(r == "R1") return StringFormat("This would be trade %d today. Your limit is %d.", (int)m.vObs[i], (int)m.vLim[i]);
   if(r == "R2") return StringFormat("This would be trade %d this hour. Your limit is %d.", (int)m.vObs[i], (int)m.vLim[i]);
   if(r == "R3")
     {
      long span = MathMax(1, (now - (m.vClears[i] - (long)m.r3Seconds * 1000)) / 1000);
      return "This is your " + DGOrdinal((int)m.vObs[i]) + " trade in " + IntegerToString(span) + " seconds.";
     }
   if(r == "R4")
      return m.vClears[i] != DG_NONE ? "It's " + DGFmtTime(m, now, now) + ". Your trading hours start at " + DGFmtTime(m, m.vClears[i], now) + "."
             : "It's " + DGFmtTime(m, now, now) + ". You're outside your trading hours.";
   if(r == "R5") return "This would make your " + m.oSym + " position " + DGFmtLots(m.vObs[i]) + " lots. Your max is " + DGFmtLots(m.vLim[i]) + ".";
   if(r == "R6") return m.vFixSl[i] ? "No stop loss, so risk can't be checked." : "This trade risks " + DGFmtMoney(m.vObs[i]) + ". Your max is " + DGFmtMoney(m.vLim[i]) + ".";
   if(r == "R7")
     {
      int mins = (int)m.vObs[i];
      return mins <= 0 ? "Your last trade just closed at a loss." : StringFormat("Your last trade closed at a loss %d minute%s ago.", mins, mins == 1 ? "" : "s");
     }
   if(r == "R8") return "You're down " + DGFmtMoney(m.vObs[i]) + " today. Your daily limit is " + DGFmtMoney(m.vLim[i]) + ".";
   if(r == "R9") return "This trade has no stop loss.";
   if(r == "R10") return "This is bigger than the trade you just lost on (" + DGFmtLots(m.vObs[i]) + " vs " + DGFmtLots(m.vLim[i]) + " lots).";
   if(r == "BREAK") return "You're on a break until " + DGFmtTime(m, m.vClears[i], now) + ".";
   if(r == "DONE_TODAY") return "You said you're done for today.";
   return "Check your plan before this trade.";
  }

/// The way-out or fix line. Empty means the plan line only.
string DGWayOut(DGModel &m, const int i, const long now)
  {
   if(i < 0 || i >= ArraySize(m.vRule)) return "";
   string r = m.vRule[i];
   if(r == "R1") return "Your limit resets " + DGFmtTime(m, m.vClears[i], now) + ".";
   if(r == "R4" && m.vClears[i] != DG_NONE) return "Your hours open at " + DGFmtTime(m, m.vClears[i], now) + ".";
   if(r == "R5") return "Trade " + DGFmtLots(m.vHasFix[i] ? m.vFixSize[i] : m.vLim[i]) + " lots or less.";
   if(r == "R6") return m.vFixSl[i] ? "Add a stop loss." : DGFmtLots(m.vFixSize[i]) + " lots fits at this stop.";
   if(r == "R8") return "You're done for today. Your rest ends " + DGFmtTime(m, m.vClears[i], now) + ".";
   if(r == "R9") return "Add a stop loss.";
   if(r == "R10") return "Trade " + DGFmtLots(m.vLim[i]) + " lots or less.";
   if(r == "DONE_TODAY") return "Your trading day resets at " + DGFmtTime(m, m.vClears[i], now) + ".";
   return "";
  }

#define DG_FOOTER "Closing, moving SL/TP and cancelling orders are never paused. To close a position, skip first."

#endif
