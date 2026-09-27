//+------------------------------------------------------------------+
//| Store.mqh                                                        |
//| Files in this terminal's own MQL5\Files\DisciplineGuard folder   |
//| (not the Common folder, SPEC §9.2). Shared by every chart of the |
//| terminal.                                                        |
//+------------------------------------------------------------------+
#ifndef DG_STORE_MQH
#define DG_STORE_MQH

#define DG_DIR "DisciplineGuard\\"

string DGRead(const string name)
  {
   int h = FileOpen(DG_DIR + name, FILE_READ | FILE_BIN | FILE_SHARE_READ | FILE_SHARE_WRITE);
   if(h == INVALID_HANDLE)
      return "";
   uchar buf[];
   FileReadArray(h, buf);
   FileClose(h);
   return CharArrayToString(buf, 0, WHOLE_ARRAY, CP_UTF8);
  }

bool DGWrite(const string name, const string text)
  {
   // Write to a temp file, then replace, so a crash never leaves half a file.
   string tmp = DG_DIR + name + ".tmp";
   int h = FileOpen(tmp, FILE_WRITE | FILE_BIN | FILE_SHARE_READ);
   if(h == INVALID_HANDLE)
      return false;
   uchar buf[];
   int n = StringToCharArray(text, buf, 0, WHOLE_ARRAY, CP_UTF8);
   if(n > 0)
      FileWriteArray(h, buf, 0, n - 1);
   FileClose(h);
   return FileMove(tmp, 0, DG_DIR + name, FILE_REWRITE);
  }

void DGDelete(const string name) { FileDelete(DG_DIR + name); }

bool DGExists(const string name) { return FileIsExist(DG_DIR + name); }

#endif
