; 卸载时的清理。
;
; 三件事：
; 1. 删掉开机自启项 —— 不删的话注册表里会留一条指向已删除 exe 的记录，
;    每次开机 Windows 都会尝试启动一个不存在的程序（用户会看到报错弹窗）
; 2. 数据库默认在 $INSTDIR\data，卸载器会 `RMDir /r $INSTDIR` 把整个目录删干净，
;    所以要在删除之前抢救（customUnInstall 在 uninstaller.nsh 第 156 行执行，
;    删除在 187 行，时机是够的）
; 3. 清掉 Electron 的 userData 缓存；但如果数据库回落到这里（装在 Program Files
;    这类只读位置时会发生），必须先备份再删，不能把数据一起清掉

!macro customUnInstall
  ; ---- 1. 开机自启 ----
  ; Electron 在 Windows 上用 app.getName() 作为注册表值名，本项目是 "Qingqing"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Qingqing"
  ; 兼容改名前的残留
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "青青"

  ; ---- 2. 数据库（正常位置：安装目录的 data/） ----
  ${if} ${FileExists} "$INSTDIR\data\qingqing.db"
    ; /SD IDYES：静默卸载（/S）时没有交互界面，必须给默认按钮，
    ; 否则卸载器会卡在这个对话框上永远不结束。默认选「备份」是安全的一侧。
    MessageBox MB_YESNO|MB_ICONQUESTION \
      "检测到数据文件（计划、任务、积分记录）。$\r$\n$\r$\n是否备份到「文档\青青」？$\r$\n选择「否」将连同程序一起删除，无法恢复。" \
      /SD IDYES \
      IDNO qingqingSkipBackup

    CreateDirectory "$DOCUMENTS\青青"
    CopyFiles /SILENT "$INSTDIR\data\*.*" "$DOCUMENTS\青青"
    DetailPrint "数据已备份到 $DOCUMENTS\青青"

    qingqingSkipBackup:
  ${endIf}

  ; ---- 3. userData 缓存 ----
  ; 数据库回落到这里时（只读安装位置），先备份再删
  ${if} ${FileExists} "$APPDATA\Qingqing\qingqing.db"
    CreateDirectory "$DOCUMENTS\青青"
    CopyFiles /SILENT "$APPDATA\Qingqing\qingqing.db*" "$DOCUMENTS\青青"
    DetailPrint "userData 中的数据库已备份到 $DOCUMENTS\青青"
  ${endIf}

  ; 缓存（Local Storage / Session / Crashpad）没有保留价值，直接清掉
  RMDir /r "$APPDATA\Qingqing"
  RMDir /r "$LOCALAPPDATA\Qingqing"
!macroend
