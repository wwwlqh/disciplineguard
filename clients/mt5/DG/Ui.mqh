//+------------------------------------------------------------------+
//| Ui.mqh                                                           |
//| Drawing for the panel (SPEC §9.2 "Rendering").                   |
//| Text is drawn on a canvas with measured wrapping; only buttons   |
//| and input fields are native objects. Sizes scale by              |
//| TERMINAL_SCREEN_DPI / 96 × the panel scale.                      |
//+------------------------------------------------------------------+
#ifndef DG_UI_MQH
#define DG_UI_MQH

#include <Canvas\Canvas.mqh>

#define DG_PFX "DG_"

double DGScale = 1.0;

int DGPx(const double px) { return (int)MathRound(px * DGScale); }

void DGSetScale(const double panelScale)
  {
   double dpi = (double)TerminalInfoInteger(TERMINAL_SCREEN_DPI);
   if(dpi <= 0) dpi = 96;
   DGScale = dpi / 96.0 * MathMax(0.6, MathMin(2.5, panelScale));
  }

struct DGPalette
  {
   uint              surface, surface2, border, text, muted, faint, accent, onAccent, amber, blue, grey;
   color             cSurface, cSurface2, cBorder, cText, cMuted, cAccent, cOnAccent;
  };

DGPalette DGPal;

uint DGArgb(const color c, const uchar a = 255) { return ColorToARGB(c, a); }

bool DGIsDarkChart()
  {
   color bg = (color)ChartGetInteger(0, CHART_COLOR_BACKGROUND);
   int r = bg & 0xFF, g = (bg >> 8) & 0xFF, b = (bg >> 16) & 0xFF;
   return (0.299 * r + 0.587 * g + 0.114 * b) < 128;
  }

/// theme: 0 auto (chart background), 1 light, 2 dark.
void DGSetPalette(const int theme)
  {
   bool dark = theme == 2 || (theme == 0 && DGIsDarkChart());
   if(dark)
     {
      DGPal.cSurface = C'23,27,32'; DGPal.cSurface2 = C'31,36,42'; DGPal.cBorder = C'45,51,59'; DGPal.cText = C'232,234,237';
      DGPal.cMuted = C'163,171,181'; DGPal.cAccent = C'45,212,191'; DGPal.cOnAccent = C'6,32,29';
      DGPal.amber = DGArgb(C'245,180,84'); DGPal.blue = DGArgb(C'96,165,250'); DGPal.grey = DGArgb(C'139,147,156');
      DGPal.faint = DGArgb(C'123,132,143');
     }
   else
     {
      DGPal.cSurface = C'255,255,255'; DGPal.cSurface2 = C'238,240,243'; DGPal.cBorder = C'217,221,227'; DGPal.cText = C'22,25,29';
      DGPal.cMuted = C'91,99,110'; DGPal.cAccent = C'15,118,110'; DGPal.cOnAccent = C'255,255,255';
      DGPal.amber = DGArgb(C'180,83,9'); DGPal.blue = DGArgb(C'37,99,235'); DGPal.grey = DGArgb(C'123,131,141');
      DGPal.faint = DGArgb(C'138,146,156');
     }
   DGPal.surface = DGArgb(DGPal.cSurface);
   DGPal.surface2 = DGArgb(DGPal.cSurface2);
   DGPal.border = DGArgb(DGPal.cBorder);
   DGPal.text = DGArgb(DGPal.cText);
   DGPal.muted = DGArgb(DGPal.cMuted);
   DGPal.accent = DGArgb(DGPal.cAccent);
   DGPal.onAccent = DGArgb(DGPal.cOnAccent);
  }

//--- native objects ------------------------------------------------
void DGObjCommon(const string n, const int x, const int y, const int w, const int h, const int z)
  {
   ObjectSetInteger(0, n, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, n, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, n, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, n, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, n, OBJPROP_YSIZE, h);
   ObjectSetInteger(0, n, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, n, OBJPROP_HIDDEN, true);
   ObjectSetInteger(0, n, OBJPROP_ZORDER, z);
   ObjectSetInteger(0, n, OBJPROP_BACK, false);
  }

void DGButton(const string name, const string text, const int x, const int y, const int w, const int h, const bool primary, const bool enabled = true, const int z = 20)
  {
   string n = DG_PFX + name;
   if(ObjectFind(0, n) < 0)
      ObjectCreate(0, n, OBJ_BUTTON, 0, 0, 0);
   DGObjCommon(n, x, y, w, h, z);
   ObjectSetString(0, n, OBJPROP_TEXT, text);
   ObjectSetString(0, n, OBJPROP_FONT, "Segoe UI Semibold");
   ObjectSetInteger(0, n, OBJPROP_FONTSIZE, (int)MathMax(7, MathRound(9 * DGScale / (TerminalInfoInteger(TERMINAL_SCREEN_DPI) / 96.0))));
   color bg = primary ? DGPal.cAccent : DGPal.cSurface2;
   color fg = primary ? DGPal.cOnAccent : (enabled ? DGPal.cText : DGPal.cMuted);
   ObjectSetInteger(0, n, OBJPROP_BGCOLOR, bg);
   ObjectSetInteger(0, n, OBJPROP_BORDER_COLOR, primary ? DGPal.cAccent : DGPal.cBorder);
   ObjectSetInteger(0, n, OBJPROP_COLOR, fg);
   ObjectSetInteger(0, n, OBJPROP_STATE, false);
  }

void DGEdit(const string name, const string initial, const int x, const int y, const int w, const int h, const int z = 20)
  {
   string n = DG_PFX + name;
   bool created = false;
   if(ObjectFind(0, n) < 0)
     {
      ObjectCreate(0, n, OBJ_EDIT, 0, 0, 0);
      ObjectSetString(0, n, OBJPROP_TEXT, initial);
      created = true;
     }
   DGObjCommon(n, x, y, w, h, z);
   ObjectSetInteger(0, n, OBJPROP_ALIGN, ALIGN_CENTER);
   ObjectSetString(0, n, OBJPROP_FONT, "Segoe UI");
   ObjectSetInteger(0, n, OBJPROP_FONTSIZE, (int)MathMax(7, MathRound(9 * DGScale / (TerminalInfoInteger(TERMINAL_SCREEN_DPI) / 96.0))));
   ObjectSetInteger(0, n, OBJPROP_BGCOLOR, DGPal.cSurface);
   ObjectSetInteger(0, n, OBJPROP_BORDER_COLOR, DGPal.cBorder);
   ObjectSetInteger(0, n, OBJPROP_COLOR, DGPal.cText);
   ObjectSetInteger(0, n, OBJPROP_READONLY, false);
   if(created) ObjectSetString(0, n, OBJPROP_TEXT, initial);
  }

string DGEditText(const string name) { return ObjectGetString(0, DG_PFX + name, OBJPROP_TEXT); }
void DGSetEditText(const string name, const string v) { ObjectSetString(0, DG_PFX + name, OBJPROP_TEXT, v); }
void DGRemove(const string name) { ObjectDelete(0, DG_PFX + name); }
void DGRemovePrefix(const string prefix) { ObjectsDeleteAll(0, DG_PFX + prefix); }

//--- canvas with text ---------------------------------------------
class DGSurface
  {
public:
   CCanvas           cv;
   string            name;
   int               x, y, w, h;
   bool              created;

                     DGSurface() { created = false; }

   bool              Open(const string nm, const int px, const int py, const int pw, const int ph, const int z = 10)
     {
      string full = DG_PFX + nm;
      if(created && (pw != w || ph != h || name != full)) Close();
      name = full; x = px; y = py; w = MathMax(1, pw); h = MathMax(1, ph);
      if(!created)
        {
         if(!cv.CreateBitmapLabel(0, 0, name, x, y, w, h, COLOR_FORMAT_ARGB_NORMALIZE)) return false;
         created = true;
        }
      ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
      ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
      ObjectSetInteger(0, name, OBJPROP_ZORDER, z);
      ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
      cv.Erase(0);
      return true;
     }

   void              Close() { if(created) { cv.Destroy(); created = false; } }

   void              Rect(const int rx, const int ry, const int rw, const int rh, const uint fill, const uint border = 0)
     {
      cv.FillRectangle(rx, ry, rx + rw - 1, ry + rh - 1, fill);
      if(border != 0) cv.Rectangle(rx, ry, rx + rw - 1, ry + rh - 1, border);
     }

   void              Font(const double px, const bool bold = false)
     {
      string face = bold ? "Segoe UI Semibold" : "Segoe UI";
      // Positive size = pixels, independent of the OS font setting. DGScale already includes DPI.
      cv.FontSet(face, (int)MathRound(px * DGScale), bold ? FW_SEMIBOLD : FW_NORMAL);
     }

   int               TextW(const string s) { int tw, th; cv.TextSize(s, tw, th); return tw; }
   int               LineH() { int tw, th; cv.TextSize("Ag", tw, th); return th; }

   void              Text(const int tx, const int ty, const string s, const uint clr) { cv.TextOut(tx, ty, s, clr); }

   /// Draws wrapped text inside maxW. Returns the height used.
   int               Wrap(const int tx, const int ty, const int maxW, const string s, const uint clr, const int maxLines = 20)
     {
      string words[];
      int n = StringSplit(s, ' ', words);
      string line = "";
      int yy = ty, lh = LineH(), lines = 0;
      for(int i = 0; i < n; i++)
        {
         string trial = line == "" ? words[i] : line + " " + words[i];
         if(TextW(trial) > maxW && line != "")
           {
            if(lines + 1 >= maxLines) { Text(tx, yy, line + "…", clr); return yy - ty + lh; }
            Text(tx, yy, line, clr);
            yy += lh;
            lines++;
            line = words[i];
           }
         else line = trial;
        }
      if(line != "") { Text(tx, yy, line, clr); yy += lh; }
      return yy - ty;
     }

   /// Height the wrapped text would take, without drawing.
   int               WrapHeight(const int maxW, const string s)
     {
      string words[];
      int n = StringSplit(s, ' ', words);
      string line = "";
      int lines = 0;
      for(int i = 0; i < n; i++)
        {
         string trial = line == "" ? words[i] : line + " " + words[i];
         if(TextW(trial) > maxW && line != "") { lines++; line = words[i]; }
         else line = trial;
        }
      if(line != "") lines++;
      return lines * LineH();
     }

   void              Dot(const int cx, const int cy, const int r, const uint clr) { cv.FillCircle(cx, cy, r, clr); }
   void              Flush() { cv.Update(false); }
  };

#endif
