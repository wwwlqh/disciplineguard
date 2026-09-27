//+------------------------------------------------------------------+
//| DG_Q10_Ed25519.mq5                                               |
//| Phase 0 spike Q10: can the EA verify an Ed25519 signature at     |
//| acceptable cost? Runs known-answer tests, then times             |
//| verifications. Result: Experts tab and                           |
//| MQL5\Files\DG_q10_result.txt. Attach to any chart; it removes    |
//| itself when done (an EA, because a script waits for chart data). |
//| Test vectors: RFC 8032 test 1, and signatures made with Node's   |
//| crypto.sign (the reference implementation).                      |
//+------------------------------------------------------------------+
#property strict

#include "../../clients/mt5/DG/Ed25519.mqh"

input int InpRuns = 20; // Timed verifications

int g_fail = 0;
string g_out = "";

void Out(const string s)
  {
   Print(s);
   g_out += s + "\r\n";
  }

void Check(const string name, const bool got, const bool want)
  {
   if(got != want)
      g_fail++;
   Out((got == want ? "PASS " : "FAIL ") + name + " (got " + (got ? "valid" : "invalid") + ")");
  }

bool VerifyHex(const string sigHex, const string msgHex, const string pkHex)
  {
   uchar sig[], msg[], pk[];
   DGHexDecode(sigHex, sig);
   DGHexDecode(msgHex, msg);
   DGHexDecode(pkHex, pk);
   return DGEd25519Verify(sig, msg, ArraySize(msg), pk);
  }

void RunQ10()
  {
   Out("==== Q10 Ed25519 in MQL5 ====");
   Out("Terminal build " + IntegerToString(TerminalInfoInteger(TERMINAL_BUILD)) + ", " + TerminalInfoString(TERMINAL_NAME));

   // SHA-512 known answer ("abc").
   uchar abc[], h[];
   DGUtf8("abc", abc);
   DGSha512(abc, ArraySize(abc), h);
   string hh = "";
   for(int i = 0; i < 64; i++)
      hh += StringFormat("%02x", h[i]);
   bool shaOk = hh == "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f";
   if(!shaOk)
      g_fail++;
   Out((shaOk ? "PASS" : "FAIL") + " sha512(abc)");

   string pk1  = "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a";
   string sig1 = "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b";
   Check("RFC 8032 test 1 (empty message)", VerifyHex(sig1, "", pk1), true);
   Check("RFC 8032 test 1, one message byte added", VerifyHex(sig1, "00", pk1), false);

   string pk2  = "fbfe6fdb928ddf6872990d1928cf61de567b7e33aa936adf3b3727cce3c71cb9";
   string msg2 = "7b2276223a312c22757365725f7265736574223a7b22747a223a224575726f70652f507261677565222c226174223a2230303a3030227d2c2272756c6573223a7b225231223a7b226d6178223a357d2c225238223a7b22616d6f756e74223a3330302c22726573745f686f757273223a31327d7d2c2276616c69645f756e74696c223a22323032362d31302d31315432323a30303a30305a222c226e6f7465223a225374616e642075702e204765742077617465722e20c39c6ec3af63c3b664c3a920e29c93227d";
   string sig2 = "5db2f8cdf663aac6fdaa3d351f28df1768e8891987911145a38ff56a9855b4180dedf2748aaa92d24a53c2d25681ee3a4b9ac61b523eb5be35d31bb33b80680a";
   Check("Rule cache signed by Node", VerifyHex(sig2, msg2, pk2), true);
   // R1 max 5 -> 9 (byte 0x35 '5' -> 0x39 '9'): an edited cache must fail.
   string tampered = msg2;
   StringReplace(tampered, "226d6178223a35", "226d6178223a39");
   Check("Rule cache with R1 edited 5 -> 9", VerifyHex(sig2, tampered, pk2), false);
   Check("Rule cache checked against the wrong key", VerifyHex(sig2, msg2, pk1), false);
   string badSig = StringSubstr(sig2, 0, 127) + (StringSubstr(sig2, 127, 1) == "a" ? "b" : "a");
   Check("Rule cache with one signature bit flipped", VerifyHex(badSig, msg2, pk2), false);

   // 3,000-byte payload, about the size of a full rule cache.
   string longHex = "";
   for(int i = 0; i < 3000; i++)
      longHex += "78";
   string sigLong = "b165f9cf8d2e449182094b201ce59f9259f0af4277ef999e255ee0b7ddd0281b23dad784f9d11307c59d3b1a95ee5062f92efddb7dcad79177e85bc0abb32106";
   Check("3,000-byte payload", VerifyHex(sigLong, longHex, pk2), true);

   // Timing.
   uchar sig[], msg[], pk[];
   DGHexDecode(sigLong, sig);
   DGHexDecode(longHex, msg);
   DGHexDecode(pk2, pk);
   int runs = MathMax(1, InpRuns);
   ulong worst = 0, total = 0;
   for(int r = 0; r < runs; r++)
     {
      ulong t0 = GetMicrosecondCount();
      bool ok = DGEd25519Verify(sig, msg, ArraySize(msg), pk);
      ulong dt = GetMicrosecondCount() - t0;
      if(!ok)
         g_fail++;
      total += dt;
      if(dt > worst)
         worst = dt;
     }
   Out(StringFormat("TIMING %d verifications of 3,000 bytes: mean %.2f ms, worst %.2f ms", runs, total / 1000.0 / runs, worst / 1000.0));
   Out(g_fail == 0 ? "RESULT PASS" : "RESULT FAIL (" + IntegerToString(g_fail) + " failures)");

   int f = FileOpen("DG_q10_result.txt", FILE_WRITE | FILE_TXT | FILE_ANSI);
   if(f != INVALID_HANDLE)
     {
      FileWriteString(f, g_out);
      FileClose(f);
     }
  }

int OnInit()
  {
   EventSetTimer(1);
   return INIT_SUCCEEDED;
  }

void OnTimer()
  {
   EventKillTimer();
   RunQ10();
   ExpertRemove();
  }

void OnDeinit(const int reason) { EventKillTimer(); }
