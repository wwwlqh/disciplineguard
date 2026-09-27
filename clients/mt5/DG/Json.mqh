//+------------------------------------------------------------------+
//| Json.mqh                                                         |
//| A small JSON reader and writer for the sync protocol.            |
//| Nodes live in flat arrays: first child / next sibling links.     |
//+------------------------------------------------------------------+
#ifndef DG_JSON_MQH
#define DG_JSON_MQH

#define JNULL  0
#define JBOOL  1
#define JNUM   2
#define JSTR   3
#define JARR   4
#define JOBJ   5

class DGJson
  {
private:
   string            m_s;
   int               m_pos;
   int               m_len;
   int               m_count;
   int               m_type[];
   string            m_key[];
   string            m_str[];
   double            m_num[];
   long              m_int[];
   bool              m_isInt[];
   int               m_first[];
   int               m_last[];
   int               m_next[];
   int               m_size[];

   int               NewNode(const int type)
     {
      if(m_count >= ArraySize(m_type))
        {
         int n = MathMax(64, m_count * 2);
         ArrayResize(m_type, n);
         ArrayResize(m_key, n);
         ArrayResize(m_str, n);
         ArrayResize(m_num, n);
         ArrayResize(m_int, n);
         ArrayResize(m_isInt, n);
         ArrayResize(m_first, n);
         ArrayResize(m_last, n);
         ArrayResize(m_next, n);
         ArrayResize(m_size, n);
        }
      int i = m_count++;
      m_type[i] = type;
      m_key[i] = "";
      m_str[i] = "";
      m_num[i] = 0;
      m_int[i] = 0;
      m_isInt[i] = false;
      m_first[i] = -1;
      m_last[i] = -1;
      m_next[i] = -1;
      m_size[i] = 0;
      return i;
     }

   void              AddChild(const int parent, const int child)
     {
      if(m_first[parent] < 0)
         m_first[parent] = child;
      else
         m_next[m_last[parent]] = child;
      m_last[parent] = child;
      m_size[parent]++;
     }

   ushort            Ch() { return m_pos < m_len ? StringGetCharacter(m_s, m_pos) : 0; }

   void              Ws()
     {
      while(m_pos < m_len)
        {
         ushort c = StringGetCharacter(m_s, m_pos);
         if(c == ' ' || c == '\t' || c == '\r' || c == '\n')
            m_pos++;
         else
            break;
        }
     }

   bool              ParseString(string &out)
     {
      if(Ch() != '"')
         return false;
      m_pos++;
      out = "";
      int start = m_pos;
      while(m_pos < m_len)
        {
         ushort c = StringGetCharacter(m_s, m_pos);
         if(c == '"')
           {
            out += StringSubstr(m_s, start, m_pos - start);
            m_pos++;
            return true;
           }
         if(c == '\\')
           {
            out += StringSubstr(m_s, start, m_pos - start);
            m_pos++;
            ushort e = Ch();
            m_pos++;
            if(e == 'n') out += "\n";
            else if(e == 't') out += "\t";
            else if(e == 'r') out += "\r";
            else if(e == 'b') out += ShortToString(8);
            else if(e == 'f') out += ShortToString(12);
            else if(e == 'u')
              {
               if(m_pos + 4 > m_len)
                  return false;
               ushort code = (ushort)StringToInteger("0x" + StringSubstr(m_s, m_pos, 4));
               out += ShortToString(code);
               m_pos += 4;
              }
            else
               out += ShortToString(e);
            start = m_pos;
            continue;
           }
         m_pos++;
        }
      return false;
     }

   int               ParseValue(const int depth)
     {
      if(depth > 64)
         return -1;
      Ws();
      ushort c = Ch();
      if(c == '{')
        {
         int node = NewNode(JOBJ);
         m_pos++;
         Ws();
         if(Ch() == '}')
           {
            m_pos++;
            return node;
           }
         while(true)
           {
            Ws();
            string k;
            if(!ParseString(k))
               return -1;
            Ws();
            if(Ch() != ':')
               return -1;
            m_pos++;
            int v = ParseValue(depth + 1);
            if(v < 0)
               return -1;
            m_key[v] = k;
            AddChild(node, v);
            Ws();
            if(Ch() == ',')
              {
               m_pos++;
               continue;
              }
            if(Ch() == '}')
              {
               m_pos++;
               return node;
              }
            return -1;
           }
        }
      if(c == '[')
        {
         int node = NewNode(JARR);
         m_pos++;
         Ws();
         if(Ch() == ']')
           {
            m_pos++;
            return node;
           }
         while(true)
           {
            int v = ParseValue(depth + 1);
            if(v < 0)
               return -1;
            AddChild(node, v);
            Ws();
            if(Ch() == ',')
              {
               m_pos++;
               continue;
              }
            if(Ch() == ']')
              {
               m_pos++;
               return node;
              }
            return -1;
           }
        }
      if(c == '"')
        {
         int node = NewNode(JSTR);
         string s;
         if(!ParseString(s))
            return -1;
         m_str[node] = s;
         return node;
        }
      if(StringSubstr(m_s, m_pos, 4) == "true")
        {
         int node = NewNode(JBOOL);
         m_int[node] = 1;
         m_pos += 4;
         return node;
        }
      if(StringSubstr(m_s, m_pos, 5) == "false")
        {
         int node = NewNode(JBOOL);
         m_pos += 5;
         return node;
        }
      if(StringSubstr(m_s, m_pos, 4) == "null")
        {
         m_pos += 4;
         return NewNode(JNULL);
        }
      // Number
      int start = m_pos;
      bool isInt = true;
      while(m_pos < m_len)
        {
         ushort d = StringGetCharacter(m_s, m_pos);
         if((d >= '0' && d <= '9') || d == '-' || d == '+')
            m_pos++;
         else if(d == '.' || d == 'e' || d == 'E')
           {
            isInt = false;
            m_pos++;
           }
         else
            break;
        }
      if(m_pos == start)
         return -1;
      string t = StringSubstr(m_s, start, m_pos - start);
      int node = NewNode(JNUM);
      m_num[node] = StringToDouble(t);
      m_isInt[node] = isInt;
      m_int[node] = isInt ? StringToInteger(t) : (long)m_num[node];
      return node;
     }

public:
                     DGJson() { m_count = 0; }

   bool              Parse(const string s)
     {
      m_s = s;
      m_pos = 0;
      m_len = StringLen(s);
      m_count = 0;
      int r = ParseValue(0);
      m_s = "";
      return r == 0;
     }

   int               Root() { return m_count > 0 ? 0 : -1; }
   int               Type(const int n) { return n >= 0 && n < m_count ? m_type[n] : -1; }
   bool              Valid(const int n) { return n >= 0 && n < m_count && m_type[n] != JNULL; }
   int               Size(const int n) { return n >= 0 && n < m_count ? m_size[n] : 0; }
   int               First(const int n) { return n >= 0 && n < m_count ? m_first[n] : -1; }
   int               Next(const int n) { return n >= 0 && n < m_count ? m_next[n] : -1; }
   string            Key(const int n) { return n >= 0 && n < m_count ? m_key[n] : ""; }

   int               Get(const int obj, const string key)
     {
      if(Type(obj) != JOBJ)
         return -1;
      for(int c = m_first[obj]; c >= 0; c = m_next[c])
         if(m_key[c] == key)
            return c;
      return -1;
     }

   int               At(const int arr, const int index)
     {
      if(Type(arr) != JARR)
         return -1;
      int i = 0;
      for(int c = m_first[arr]; c >= 0; c = m_next[c], i++)
         if(i == index)
            return c;
      return -1;
     }

   /// Follows a dotted path like "rules.R1.max".
   int               Path(const int from, const string path)
     {
      string parts[];
      int n = StringSplit(path, '.', parts);
      int cur = from;
      for(int i = 0; i < n && cur >= 0; i++)
         cur = Get(cur, parts[i]);
      return cur;
     }

   double            Num(const int n, const double def = 0)
     {
      if(Type(n) == JNUM) return m_num[n];
      if(Type(n) == JBOOL) return (double)m_int[n];
      return def;
     }
   long              Long(const int n, const long def = 0)
     {
      if(Type(n) == JNUM) return m_isInt[n] ? m_int[n] : (long)MathRound(m_num[n]);
      if(Type(n) == JBOOL) return m_int[n];
      return def;
     }
   bool              Bool(const int n, const bool def = false) { return Type(n) == JBOOL ? m_int[n] != 0 : def; }
   string            Str(const int n, const string def = "") { return Type(n) == JSTR ? m_str[n] : def; }
  };

//--- Writing -----------------------------------------------------------
string DGJsonEscape(const string s)
  {
   string out = "";
   int n = StringLen(s);
   for(int i = 0; i < n; i++)
     {
      ushort c = StringGetCharacter(s, i);
      if(c == '"') out += "\\\"";
      else if(c == '\\') out += "\\\\";
      else if(c == '\n') out += "\\n";
      else if(c == '\r') out += "\\r";
      else if(c == '\t') out += "\\t";
      else if(c < 0x20) out += StringFormat("\\u%04x", c);
      else out += ShortToString(c);
     }
   return "\"" + out + "\"";
  }

string DGJsonNum(const double x)
  {
   if(x == MathRound(x) && MathAbs(x) < 1e15)
      return IntegerToString((long)x);
   string s = DoubleToString(x, 8);
   // Trim trailing zeros.
   while(StringLen(s) > 1 && StringGetCharacter(s, StringLen(s) - 1) == '0')
      s = StringSubstr(s, 0, StringLen(s) - 1);
   if(StringGetCharacter(s, StringLen(s) - 1) == '.')
      s = StringSubstr(s, 0, StringLen(s) - 1);
   return s;
  }

/// Builds a JSON object: call Add* then Close().
class DGJsonWriter
  {
private:
   string            m_out;
   bool              m_first[];
   int               m_depth;
   void              Sep()
     {
      if(m_depth > 0)
        {
         if(!m_first[m_depth - 1])
            m_out += ",";
         m_first[m_depth - 1] = false;
        }
     }
   void              Key(const string k) { if(k != "") m_out += DGJsonEscape(k) + ":"; }
public:
                     DGJsonWriter() { m_out = ""; m_depth = 0; ArrayResize(m_first, 32); }
   void              BeginObj(const string k = "") { Sep(); Key(k); m_out += "{"; m_first[m_depth++] = true; }
   void              BeginArr(const string k = "") { Sep(); Key(k); m_out += "["; m_first[m_depth++] = true; }
   void              EndObj() { m_out += "}"; m_depth--; }
   void              EndArr() { m_out += "]"; m_depth--; }
   void              Str(const string k, const string v) { Sep(); Key(k); m_out += DGJsonEscape(v); }
   void              Num(const string k, const double v) { Sep(); Key(k); m_out += DGJsonNum(v); }
   void              Long(const string k, const long v) { Sep(); Key(k); m_out += IntegerToString(v); }
   void              Bool(const string k, const bool v) { Sep(); Key(k); m_out += (v ? "true" : "false"); }
   void              Null(const string k) { Sep(); Key(k); m_out += "null"; }
   void              Raw(const string k, const string json) { Sep(); Key(k); m_out += json; }
   string            Text() { return m_out; }
  };

#endif
