//+------------------------------------------------------------------+
//| Ed25519.mqh                                                      |
//| Ed25519 signature verification (RFC 8032) for the signed rule    |
//| cache (SPEC §10.5, spike Q10). A port of TweetNaCl's             |
//| crypto_sign_open, verify only. Field elements are 16 signed      |
//| 64-bit limbs of 16 bits each.                                    |
//| Constants were generated with BigInt, not copied by hand.        |
//+------------------------------------------------------------------+
#ifndef DG_ED25519_MQH
#define DG_ED25519_MQH

struct DGGf { long v[16]; };
struct DGPt { DGGf x; DGGf y; DGGf z; DGGf t; };

DGGf   dg_gf0, dg_gf1, dg_D, dg_D2, dg_X, dg_Y, dg_I;
long   dg_L[32];
ulong  dg_K512[80];
bool   dg_ed_ready = false;

// Floor division by 2^n, independent of how the compiler shifts negative numbers.
long DGFloorShr(const long x, const int n)
  {
   long d = ((long)1) << n;
   long q = x / d;
   if(x % d != 0 && x < 0)
      q--;
   return q;
  }

void DGGfSet(DGGf &o, const long &src[])
  {
   for(int i = 0; i < 16; i++)
      o.v[i] = src[i];
  }

void DGEdInit()
  {
   if(dg_ed_ready)
      return;
   long z[16]  = {0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0};
   long o[16]  = {1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0};
   long d[16]  = {0x78a3,0x1359,0x4dca,0x75eb,0xd8ab,0x4141,0x0a4d,0x0070,0xe898,0x7779,0x4079,0x8cc7,0xfe73,0x2b6f,0x6cee,0x5203};
   long d2[16] = {0xf159,0x26b2,0x9b94,0xebd6,0xb156,0x8283,0x149a,0x00e0,0xd130,0xeef3,0x80f2,0x198e,0xfce7,0x56df,0xd9dc,0x2406};
   long x[16]  = {0xd51a,0x8f25,0x2d60,0xc956,0xa7b2,0x9525,0xc760,0x692c,0xdc5c,0xfdd6,0xe231,0xc0a4,0x53fe,0xcd6e,0x36d3,0x2169};
   long y[16]  = {0x6658,0x6666,0x6666,0x6666,0x6666,0x6666,0x6666,0x6666,0x6666,0x6666,0x6666,0x6666,0x6666,0x6666,0x6666,0x6666};
   long im[16] = {0xa0b0,0x4a0e,0x1b27,0xc4ee,0xe478,0xad2f,0x1806,0x2f43,0xd7a7,0x3dfb,0x0099,0x2b4d,0xdf0b,0x4fc1,0x2480,0x2b83};
   long l[32]  = {0xed,0xd3,0xf5,0x5c,0x1a,0x63,0x12,0x58,0xd6,0x9c,0xf7,0xa2,0xde,0xf9,0xde,0x14,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0x10};
   ulong k[80] = {
      0x428a2f98d728ae22,0x7137449123ef65cd,0xb5c0fbcfec4d3b2f,0xe9b5dba58189dbbc,0x3956c25bf348b538,0x59f111f1b605d019,0x923f82a4af194f9b,0xab1c5ed5da6d8118,
      0xd807aa98a3030242,0x12835b0145706fbe,0x243185be4ee4b28c,0x550c7dc3d5ffb4e2,0x72be5d74f27b896f,0x80deb1fe3b1696b1,0x9bdc06a725c71235,0xc19bf174cf692694,
      0xe49b69c19ef14ad2,0xefbe4786384f25e3,0x0fc19dc68b8cd5b5,0x240ca1cc77ac9c65,0x2de92c6f592b0275,0x4a7484aa6ea6e483,0x5cb0a9dcbd41fbd4,0x76f988da831153b5,
      0x983e5152ee66dfab,0xa831c66d2db43210,0xb00327c898fb213f,0xbf597fc7beef0ee4,0xc6e00bf33da88fc2,0xd5a79147930aa725,0x06ca6351e003826f,0x142929670a0e6e70,
      0x27b70a8546d22ffc,0x2e1b21385c26c926,0x4d2c6dfc5ac42aed,0x53380d139d95b3df,0x650a73548baf63de,0x766a0abb3c77b2a8,0x81c2c92e47edaee6,0x92722c851482353b,
      0xa2bfe8a14cf10364,0xa81a664bbc423001,0xc24b8b70d0f89791,0xc76c51a30654be30,0xd192e819d6ef5218,0xd69906245565a910,0xf40e35855771202a,0x106aa07032bbd1b8,
      0x19a4c116b8d2d0c8,0x1e376c085141ab53,0x2748774cdf8eeb99,0x34b0bcb5e19b48a8,0x391c0cb3c5c95a63,0x4ed8aa4ae3418acb,0x5b9cca4f7763e373,0x682e6ff3d6b2b8a3,
      0x748f82ee5defb2fc,0x78a5636f43172f60,0x84c87814a1f0ab72,0x8cc702081a6439ec,0x90befffa23631e28,0xa4506cebde82bde9,0xbef9a3f7b2c67915,0xc67178f2e372532b,
      0xca273eceea26619c,0xd186b8c721c0c207,0xeada7dd6cde0eb1e,0xf57d4f7fee6ed178,0x06f067aa72176fba,0x0a637dc5a2c898a6,0x113f9804bef90dae,0x1b710b35131c471b,
      0x28db77f523047d84,0x32caab7b40c72493,0x3c9ebe0a15c9bebc,0x431d67c49c100d4c,0x4cc5d4becb3e42b6,0x597f299cfc657e2a,0x5fcb6fab3ad6faec,0x6c44198c4a475817};
   DGGfSet(dg_gf0, z);
   DGGfSet(dg_gf1, o);
   DGGfSet(dg_D, d);
   DGGfSet(dg_D2, d2);
   DGGfSet(dg_X, x);
   DGGfSet(dg_Y, y);
   DGGfSet(dg_I, im);
   for(int i = 0; i < 32; i++)
      dg_L[i] = l[i];
   for(int i = 0; i < 80; i++)
      dg_K512[i] = k[i];
   dg_ed_ready = true;
  }

//--- SHA-512 ---------------------------------------------------------
ulong DGRotr(const ulong x, const int n) { return (x >> n) | (x << (64 - n)); }

void DGSha512(const uchar &msg[], const int len, uchar &out[])
  {
   DGEdInit();
   ulong h[8] = {0x6a09e667f3bcc908,0xbb67ae8584caa73b,0x3c6ef372fe94f82b,0xa54ff53a5f1d36f1,
                 0x510e527fade682d1,0x9b05688c2b3e6c1f,0x1f83d9abfb41bd6b,0x5be0cd19137e2179};
   int padded = ((len + 17 + 127) / 128) * 128;
   uchar buf[];
   ArrayResize(buf, padded);
   ArrayInitialize(buf, 0);
   for(int i = 0; i < len; i++)
      buf[i] = msg[i];
   buf[len] = 0x80;
   ulong bits = (ulong)len * 8;
   for(int i = 0; i < 8; i++)
      buf[padded - 1 - i] = (uchar)((bits >> (8 * i)) & 0xff);
   ulong w[80];
   for(int blk = 0; blk < padded; blk += 128)
     {
      for(int i = 0; i < 16; i++)
        {
         ulong v = 0;
         for(int j = 0; j < 8; j++)
            v = (v << 8) | (ulong)buf[blk + i * 8 + j];
         w[i] = v;
        }
      for(int i = 16; i < 80; i++)
        {
         ulong s0 = DGRotr(w[i - 15], 1) ^ DGRotr(w[i - 15], 8) ^ (w[i - 15] >> 7);
         ulong s1 = DGRotr(w[i - 2], 19) ^ DGRotr(w[i - 2], 61) ^ (w[i - 2] >> 6);
         w[i] = w[i - 16] + s0 + w[i - 7] + s1;
        }
      ulong a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
      for(int i = 0; i < 80; i++)
        {
         ulong S1 = DGRotr(e, 14) ^ DGRotr(e, 18) ^ DGRotr(e, 41);
         ulong ch = (e & f) ^ ((~e) & g);
         ulong t1 = hh + S1 + ch + dg_K512[i] + w[i];
         ulong S0 = DGRotr(a, 28) ^ DGRotr(a, 34) ^ DGRotr(a, 39);
         ulong mj = (a & b) ^ (a & c) ^ (b & c);
         ulong t2 = S0 + mj;
         hh = g; g = f; f = e; e = d + t1; d = c; c = b; b = a; a = t1 + t2;
        }
      h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
     }
   ArrayResize(out, 64);
   for(int i = 0; i < 8; i++)
      for(int j = 0; j < 8; j++)
         out[i * 8 + j] = (uchar)((h[i] >> (56 - 8 * j)) & 0xff);
  }

//--- field arithmetic mod 2^255-19 -----------------------------------
void DGCar(DGGf &o)
  {
   for(int i = 0; i < 16; i++)
     {
      o.v[i] += ((long)1 << 16);
      long c = DGFloorShr(o.v[i], 16);
      if(i < 15)
         o.v[i + 1] += c - 1;
      else
         o.v[0] += 38 * (c - 1);
      o.v[i] -= c * 65536;
     }
  }

void DGSel(DGGf &p, DGGf &q, const int b)
  {
   long c = ~((long)b - 1);
   for(int i = 0; i < 16; i++)
     {
      long t = c & (p.v[i] ^ q.v[i]);
      p.v[i] ^= t;
      q.v[i] ^= t;
     }
  }

void DGPack(uchar &o[], const DGGf &n)
  {
   DGGf m, t;
   t = n;
   DGCar(t);
   DGCar(t);
   DGCar(t);
   for(int j = 0; j < 2; j++)
     {
      m.v[0] = t.v[0] - 0xffed;
      for(int i = 1; i < 15; i++)
        {
         m.v[i] = t.v[i] - 0xffff - (DGFloorShr(m.v[i - 1], 16) & 1);
         m.v[i - 1] &= 0xffff;
        }
      m.v[15] = t.v[15] - 0x7fff - (DGFloorShr(m.v[14], 16) & 1);
      int b = (int)(DGFloorShr(m.v[15], 16) & 1);
      m.v[14] &= 0xffff;
      DGSel(t, m, 1 - b);
     }
   ArrayResize(o, 32);
   for(int i = 0; i < 16; i++)
     {
      o[2 * i]     = (uchar)(t.v[i] & 0xff);
      o[2 * i + 1] = (uchar)((t.v[i] >> 8) & 0xff);
     }
  }

bool DGNeq(const DGGf &a, const DGGf &b)
  {
   uchar c[], d[];
   DGPack(c, a);
   DGPack(d, b);
   int diff = 0;
   for(int i = 0; i < 32; i++)
      diff |= c[i] ^ d[i];
   return diff != 0;
  }

int DGPar(const DGGf &a)
  {
   uchar d[];
   DGPack(d, a);
   return d[0] & 1;
  }

void DGUnpack(DGGf &o, const uchar &n[], const int off)
  {
   for(int i = 0; i < 16; i++)
      o.v[i] = (long)n[off + 2 * i] + ((long)n[off + 2 * i + 1] << 8);
   o.v[15] &= 0x7fff;
  }

void DGAdd(DGGf &o, const DGGf &a, const DGGf &b) { for(int i = 0; i < 16; i++) o.v[i] = a.v[i] + b.v[i]; }
void DGSub(DGGf &o, const DGGf &a, const DGGf &b) { for(int i = 0; i < 16; i++) o.v[i] = a.v[i] - b.v[i]; }

void DGMul(DGGf &o, const DGGf &a, const DGGf &b)
  {
   long t[31];
   ArrayInitialize(t, 0);
   for(int i = 0; i < 16; i++)
      for(int j = 0; j < 16; j++)
         t[i + j] += a.v[i] * b.v[j];
   for(int i = 0; i < 15; i++)
      t[i] += 38 * t[i + 16];
   for(int i = 0; i < 16; i++)
      o.v[i] = t[i];
   DGCar(o);
   DGCar(o);
  }

void DGSq(DGGf &o, const DGGf &a) { DGMul(o, a, a); }

void DGPow2523(DGGf &o, const DGGf &i)
  {
   DGGf c;
   c = i;
   for(int a = 250; a >= 0; a--)
     {
      DGSq(c, c);
      if(a != 1)
         DGMul(c, c, i);
     }
   o = c;
  }

void DGInv(DGGf &o, const DGGf &i)
  {
   DGGf c;
   c = i;
   for(int a = 253; a >= 0; a--)
     {
      DGSq(c, c);
      if(a != 2 && a != 4)
         DGMul(c, c, i);
     }
   o = c;
  }

//--- group operations --------------------------------------------------
void DGPtAdd(DGPt &p, const DGPt &q)
  {
   DGGf a, b, c, d, t, e, f, g, h;
   DGSub(a, p.y, p.x);
   DGSub(t, q.y, q.x);
   DGMul(a, a, t);
   DGAdd(b, p.x, p.y);
   DGAdd(t, q.x, q.y);
   DGMul(b, b, t);
   DGMul(c, p.t, q.t);
   DGMul(c, c, dg_D2);
   DGMul(d, p.z, q.z);
   DGAdd(d, d, d);
   DGSub(e, b, a);
   DGSub(f, d, c);
   DGAdd(g, d, c);
   DGAdd(h, b, a);
   DGMul(p.x, e, f);
   DGMul(p.y, h, g);
   DGMul(p.z, g, f);
   DGMul(p.t, e, h);
  }

void DGCswap(DGPt &p, DGPt &q, const int b)
  {
   DGSel(p.x, q.x, b);
   DGSel(p.y, q.y, b);
   DGSel(p.z, q.z, b);
   DGSel(p.t, q.t, b);
  }

void DGPtPack(uchar &r[], const DGPt &p)
  {
   DGGf tx, ty, zi;
   DGInv(zi, p.z);
   DGMul(tx, p.x, zi);
   DGMul(ty, p.y, zi);
   DGPack(r, ty);
   r[31] ^= (uchar)(DGPar(tx) << 7);
  }

// p = s * q. s is 32 little-endian bytes at s[off].
void DGScalarMult(DGPt &p, DGPt &q, const uchar &s[], const int off)
  {
   p.x = dg_gf0;
   p.y = dg_gf1;
   p.z = dg_gf1;
   p.t = dg_gf0;
   for(int i = 255; i >= 0; i--)
     {
      int b = (s[off + i / 8] >> (i & 7)) & 1;
      DGCswap(p, q, b);
      DGPtAdd(q, p);
      DGPt pp;
      pp = p;
      DGPtAdd(p, pp);
      DGCswap(p, q, b);
     }
  }

void DGScalarBase(DGPt &p, const uchar &s[], const int off)
  {
   DGPt q;
   q.x = dg_X;
   q.y = dg_Y;
   q.z = dg_gf1;
   DGMul(q.t, dg_X, dg_Y);
   DGScalarMult(p, q, s, off);
  }

// Reduces a 64-byte little-endian number modulo the group order L.
void DGModL(uchar &r[], long &x[])
  {
   long carry;
   for(int i = 63; i >= 32; i--)
     {
      carry = 0;
      int j;
      for(j = i - 32; j < i - 12; j++)
        {
         x[j] += carry - 16 * x[i] * dg_L[j - (i - 32)];
         carry = DGFloorShr(x[j] + 128, 8);
         x[j] -= carry * 256;
        }
      x[j] += carry;
      x[i] = 0;
     }
   carry = 0;
   for(int j = 0; j < 32; j++)
     {
      x[j] += carry - DGFloorShr(x[31], 4) * dg_L[j];
      carry = DGFloorShr(x[j], 8);
      x[j] &= 255;
     }
   for(int j = 0; j < 32; j++)
      x[j] -= carry * dg_L[j];
   ArrayResize(r, 32);
   for(int i = 0; i < 32; i++)
     {
      x[i + 1] += DGFloorShr(x[i], 8);
      r[i] = (uchar)(x[i] & 255);
     }
  }

void DGReduce(uchar &r[], const uchar &h[])
  {
   long x[64];
   for(int i = 0; i < 64; i++)
      x[i] = (long)h[i];
   DGModL(r, x);
  }

// r = -A for the encoded public key. False if the key is not a valid point.
bool DGUnpackNeg(DGPt &r, const uchar &p[])
  {
   DGGf t, chk, num, den, den2, den4, den6;
   r.z = dg_gf1;
   DGUnpack(r.y, p, 0);
   DGSq(num, r.y);
   DGMul(den, num, dg_D);
   DGSub(num, num, r.z);
   DGAdd(den, r.z, den);
   DGSq(den2, den);
   DGSq(den4, den2);
   DGMul(den6, den4, den2);
   DGMul(t, den6, num);
   DGMul(t, t, den);
   DGPow2523(t, t);
   DGMul(t, t, num);
   DGMul(t, t, den);
   DGMul(t, t, den);
   DGMul(r.x, t, den);
   DGSq(chk, r.x);
   DGMul(chk, chk, den);
   if(DGNeq(chk, num))
      DGMul(r.x, r.x, dg_I);
   DGSq(chk, r.x);
   DGMul(chk, chk, den);
   if(DGNeq(chk, num))
      return false;
   if(DGPar(r.x) == (p[31] >> 7))
      DGSub(r.x, dg_gf0, r.x);
   DGMul(r.t, r.x, r.y);
   return true;
  }

// S must be below L (RFC 8032 §5.1.7), which rules out malleable signatures.
bool DGScalarBelowL(const uchar &sig[])
  {
   for(int i = 31; i >= 0; i--)
     {
      long s = (long)sig[32 + i];
      if(s < dg_L[i])
         return true;
      if(s > dg_L[i])
         return false;
     }
   return false;
  }

//--- public API ------------------------------------------------------
// sig: 64 bytes (R || S). pk: 32 bytes. msg: msgLen bytes.
bool DGEd25519Verify(const uchar &sig[], const uchar &msg[], const int msgLen, const uchar &pk[])
  {
   DGEdInit();
   if(ArraySize(sig) < 64 || ArraySize(pk) < 32 || msgLen < 0 || ArraySize(msg) < msgLen)
      return false;
   if(!DGScalarBelowL(sig))
      return false;
   DGPt p, q;
   if(!DGUnpackNeg(q, pk))
      return false;
   uchar hm[];
   ArrayResize(hm, 64 + msgLen);
   for(int i = 0; i < 32; i++)
     {
      hm[i] = sig[i];
      hm[32 + i] = pk[i];
     }
   for(int i = 0; i < msgLen; i++)
      hm[64 + i] = msg[i];
   uchar h[], hr[];
   DGSha512(hm, 64 + msgLen, h);
   DGReduce(hr, h);
   DGScalarMult(p, q, hr, 0);
   DGPt sb;
   DGScalarBase(sb, sig, 32);
   DGPtAdd(p, sb);
   uchar t[];
   DGPtPack(t, p);
   int diff = 0;
   for(int i = 0; i < 32; i++)
      diff |= sig[i] ^ t[i];
   return diff == 0;
  }

//--- encoding helpers ------------------------------------------------
int DGHexNibble(const ushort c)
  {
   if(c >= '0' && c <= '9') return c - '0';
   if(c >= 'a' && c <= 'f') return c - 'a' + 10;
   if(c >= 'A' && c <= 'F') return c - 'A' + 10;
   return -1;
  }

bool DGHexDecode(const string hex, uchar &out[])
  {
   int n = StringLen(hex);
   if(n % 2 != 0)
      return false;
   ArrayResize(out, n / 2);
   for(int i = 0; i < n / 2; i++)
     {
      int hi = DGHexNibble(StringGetCharacter(hex, 2 * i));
      int lo = DGHexNibble(StringGetCharacter(hex, 2 * i + 1));
      if(hi < 0 || lo < 0)
         return false;
      out[i] = (uchar)(hi * 16 + lo);
     }
   return true;
  }

// UTF-8 bytes of a string, without the trailing zero.
int DGUtf8(const string s, uchar &out[])
  {
   int n = StringToCharArray(s, out, 0, WHOLE_ARRAY, CP_UTF8);
   if(n > 0 && out[n - 1] == 0)
      n--;
   ArrayResize(out, n);
   return n;
  }

#endif
