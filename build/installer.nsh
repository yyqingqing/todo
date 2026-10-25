; 卸载时的数据保护。
;
; 数据库在 $INSTDIR\data\qingqing.db，而 electron-builder 的卸载器会
; `RMDir /r $INSTDIR` 把所有东西删干净。customUnInstall 在删除之前执行
; （uninstaller.nsh 第 156 行 vs 第 187 行），所以在这里做抢救。
;
; 用 CopyFiles 而不是 Rename：复制完原目录继续随卸载删除，
; 用户的文档里留一份干净的副本，不会留下权限奇怪的残留。

!macro customUnInstall
  ${if} ${FileExists} "$INSTDIR\data\qingqing.db"
    ; /SD IDYES：静默卸载（/S）时没有交互界面，必须给默认按钮，
    ; 否则卸载器会卡在这个对话框上永远不结束。默认选「备份」是安全的一侧。
    MessageBox MB_YESNO|MB_ICONQUESTION \
      "检测到数据文件（计划、任务、积分记录）。$\r$\n$\r$\n是否备份到「文档\青青」？$\r$\n选择「否」将连同程序一起删除，无法恢复。" \
      /SD IDYES \
      IDNO qingqingSkipBackup

    CreateDirectory "$DOCUMENTS\青青"
    CopyFiles /SILENT "$INSTDIR\data\*.*" "$DOCUMENTS\青青"
    ; WAL 模式下未合并的部分在 -wal 文件里，一并拷走
    DetailPrint "数据已备份到 $DOCUMENTS\青青"

    qingqingSkipBackup:
  ${endIf}
!macroend
