; Uninstalling is a loosening (SPEC §9.5): the app sends protection-off first, and takes the EA out of
; MetaTrader only once the server has it. Without server contact the EA stays, with the saved rules.
!macro NSIS_HOOK_PREUNINSTALL
  nsExec::Exec '"$INSTDIR\DisciplineGuard.exe" --uninstall'
  Pop $0
  ${If} $0 != 0
    MessageBox MB_OK|MB_ICONINFORMATION "DisciplineGuard couldn't reach its server, so the panel stays in MetaTrader with your saved rules. To remove it, remove the account on the website (Devices), then take the EA off your charts."
  ${EndIf}
!macroend
