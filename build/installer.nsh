; 卸载时的清理。
;
; 数据库不在安装目录里 —— 它在 `<安装目录>\..\Qingqing-Data`（同级目录）。
; 这么做是因为卸载器会 `RMDir /r $INSTDIR`，而「覆盖安装」= 先卸载再装，
; 数据放里面必然每次更新都丢。放在同级目录，卸载器根本碰不到。
;
; 这里只做两件事：
; 1. 清掉开机自启项（否则注册表留下指向已删 exe 的记录，每次开机报错）
; 2. 告诉用户数据还在哪，别以为卸载就把数据一起删了

!macro customUnInstall
  ; ---- 开机自启 ----
  ; Windows 上 setLoginItemSettings 写的值名是 AppUserModelId
  ; （本项目 com.qingqing.app），不是 app.getName()。
  ; 三个名字都删，兼容改名前的残留。
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.qingqing.app"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Qingqing"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "青青"

  ; ---- 数据提示 ----
  ; 数据目录不会被删，但用户需要知道它在哪。
  ; /SD IDOK：静默卸载时不能卡在对话框上
  ${if} ${FileExists} "$INSTDIR\..\Qingqing-Data\qingqing.db"
    MessageBox MB_OK|MB_ICONINFORMATION \
      "程序已卸载。$\r$\n$\r$\n你的数据仍保留在：$\r$\n$INSTDIR\..\Qingqing-Data$\r$\n$\r$\n如需彻底清除，请手动删除该文件夹。" \
      /SD IDOK
  ${endIf}

  ; ---- Electron 缓存（没有保留价值） ----
  RMDir /r "$APPDATA\Qingqing"
  RMDir /r "$LOCALAPPDATA\Qingqing"
!macroend
