using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;

namespace ZiyeGuildLocal
{
    static class Program
    {
        const string AppUrl = "http://127.0.0.1:3001/";
        const string MutexName = "Global\\ZiyeGuildLocalApp";

        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            AutoUpdate.EnableTls12();

            var baseDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
            var nodeExe = Path.Combine(baseDir, "runtime", "node.exe");
            var launcher = Path.Combine(baseDir, "launcher.cjs");

            if (!File.Exists(nodeExe) || !File.Exists(launcher))
            {
                MessageBox.Show(
                    "安装包不完整，缺少 runtime\\node.exe 或 launcher.cjs。\n请重新下载完整版本。",
                    "紫夜公会官网 - 本地版",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
                return;
            }

            bool createdNew;
            using (var mutex = new Mutex(true, MutexName, out createdNew))
            {
                if (!createdNew)
                {
                    OpenBrowser();
                    return;
                }

                Application.Run(new TrayApplicationContext(baseDir, nodeExe, launcher));
            }
        }

        static void OpenBrowser()
        {
            try
            {
                Process.Start(new ProcessStartInfo(AppUrl) { UseShellExecute = true });
            }
            catch
            {
                MessageBox.Show(
                    "程序已在运行中。\n请在浏览器访问：" + AppUrl,
                    "紫夜公会官网 - 本地版",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information
                );
            }
        }
    }

    enum UpdateCheckResult
    {
        Skipped,
        UpToDate,
        Restarting,
        Failed
    }

    sealed class TrayApplicationContext : ApplicationContext
    {
        const string AppUrl = "http://127.0.0.1:3001/";

        readonly string _baseDir;
        readonly string _nodeExe;
        readonly string _launcherScript;
        readonly string _errorFile;
        readonly NotifyIcon _trayIcon;
        readonly Form _splash;
        readonly Label _statusLabel;
        readonly System.Windows.Forms.Timer _pollTimer;
        readonly SynchronizationContext _ui;

        Process _nodeProcess;
        bool _ready;
        int _pollAttempts;
        bool _exitingForUpdate;

        public TrayApplicationContext(string baseDir, string nodeExe, string launcherScript)
        {
            _baseDir = baseDir;
            _nodeExe = nodeExe;
            _launcherScript = launcherScript;
            _errorFile = Path.Combine(baseDir, "last-error.txt");
            _ui = SynchronizationContext.Current ?? new WindowsFormsSynchronizationContext();

            _splash = new Form
            {
                Text = "紫夜公会官网 - 本地版",
                ClientSize = new Size(420, 120),
                FormBorderStyle = FormBorderStyle.FixedDialog,
                StartPosition = FormStartPosition.CenterScreen,
                MaximizeBox = false,
                MinimizeBox = false,
                ControlBox = false,
                ShowInTaskbar = true,
            };

            _statusLabel = new Label
            {
                Text = "正在检查更新...",
                Dock = DockStyle.Fill,
                TextAlign = ContentAlignment.MiddleCenter,
            };
            _splash.Controls.Add(_statusLabel);
            _splash.Show();
            Application.DoEvents();

            _trayIcon = CreateTrayIcon();
            _trayIcon.Text = "紫夜公会官网 - 正在启动…";
            _trayIcon.Visible = true;

            _pollTimer = new System.Windows.Forms.Timer { Interval = 500 };
            _pollTimer.Tick += delegate { PollServiceReady(); };

            var updateResult = AutoUpdate.CheckAndApply(
                _baseDir,
                Process.GetCurrentProcess().Id,
                SetSplashStatus
            );

            if (updateResult == UpdateCheckResult.Restarting)
            {
                // 必须结束进程，apply-update.cmd 才能覆盖 紫夜官网.exe
                ExitForUpdate();
                return;
            }

            SetSplashStatus("正在启动，请稍候...");
            StartNodeProcess(nodeExe, launcherScript);
            _pollTimer.Start();
        }

        void SetSplashStatus(string text)
        {
            if (_statusLabel.IsDisposed)
            {
                return;
            }

            if (_statusLabel.InvokeRequired)
            {
                _statusLabel.BeginInvoke(new Action(delegate { SetSplashStatus(text); }));
                return;
            }

            _statusLabel.Text = text;
            if (!_splash.Visible)
            {
                _splash.ShowInTaskbar = true;
                _splash.Show();
            }
            _splash.Refresh();
            Application.DoEvents();
        }

        /// <summary>
        /// 停止服务并强制退出当前进程，让更新脚本覆盖文件后重新启动。
        /// </summary>
        void ExitForUpdate()
        {
            _exitingForUpdate = true;

            try { _pollTimer.Stop(); } catch { }

            KillNodeQuiet();

            try { _trayIcon.Visible = false; } catch { }
            try { _trayIcon.Dispose(); } catch { }

            try
            {
                if (!_splash.IsDisposed)
                {
                    _splash.Hide();
                    _splash.Close();
                }
            }
            catch
            {
            }

            // ExitThread 不足以保证进程立刻结束（托盘/隐藏窗体可能残留），
            // 更新脚本正等待本 PID 退出后才能 robocopy。
            Environment.Exit(0);
        }

        void RequestExitForUpdate()
        {
            _exitingForUpdate = true;
            try
            {
                _ui.Post(delegate
                {
                    ExitForUpdate();
                }, null);
            }
            catch
            {
                ExitForUpdate();
            }
        }

        NotifyIcon CreateTrayIcon()
        {
            var trayIcon = new NotifyIcon
            {
                Text = "紫夜公会官网 - 运行中",
            };

            try
            {
                var iconPath = Path.Combine(_baseDir, "app.ico");
                if (File.Exists(iconPath))
                {
                    trayIcon.Icon = new Icon(iconPath);
                }
                else
                {
                    trayIcon.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath)
                        ?? SystemIcons.Application;
                }
            }
            catch
            {
                trayIcon.Icon = SystemIcons.Application;
            }

            var menu = new ContextMenuStrip();
            menu.Items.Add("打开网站", null, delegate { OpenBrowser(); });
            menu.Items.Add("检查更新", null, delegate { CheckUpdateFromTray(); });
            menu.Items.Add("退出", null, delegate { Shutdown(); });
            trayIcon.ContextMenuStrip = menu;
            trayIcon.DoubleClick += delegate { OpenBrowser(); };

            return trayIcon;
        }

        void CheckUpdateFromTray()
        {
            if (_exitingForUpdate)
            {
                return;
            }

            var thread = new Thread(delegate()
            {
                try
                {
                    Action<string> status = delegate(string text)
                    {
                        try
                        {
                            _trayIcon.ShowBalloonTip(2500, "紫夜公会官网", text, ToolTipIcon.Info);
                        }
                        catch
                        {
                        }
                    };

                    var result = AutoUpdate.CheckAndApply(
                        _baseDir,
                        Process.GetCurrentProcess().Id,
                        status,
                        true
                    );

                    if (result == UpdateCheckResult.Restarting)
                    {
                        status("更新已就绪，正在退出并安装…");
                        RequestExitForUpdate();
                        return;
                    }

                    if (result == UpdateCheckResult.UpToDate)
                    {
                        status("已是最新版本");
                    }
                    else if (result == UpdateCheckResult.Failed)
                    {
                        status("检查更新失败，请稍后重试");
                    }
                    else if (result == UpdateCheckResult.Skipped)
                    {
                        status("未配置更新源，请联系管理员");
                    }
                }
                catch (Exception ex)
                {
                    try
                    {
                        _trayIcon.ShowBalloonTip(
                            3000,
                            "紫夜公会官网",
                            "检查更新失败：" + ex.Message,
                            ToolTipIcon.Warning
                        );
                    }
                    catch
                    {
                    }
                }
            });
            thread.IsBackground = true;
            thread.Start();
        }

        void StartNodeProcess(string nodeExe, string launcherScript)
        {
            var startInfo = new ProcessStartInfo
            {
                FileName = nodeExe,
                Arguments = "\"" + launcherScript + "\"",
                WorkingDirectory = _baseDir,
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8,
            };
            startInfo.EnvironmentVariables["ZIYE_TRAY_MODE"] = "1";

            _nodeProcess = Process.Start(startInfo);
            if (_nodeProcess == null)
            {
                ShowStartupFailed("无法启动本地服务进程。");
                return;
            }

            _nodeProcess.EnableRaisingEvents = true;
            _nodeProcess.Exited += delegate
            {
                if (_exitingForUpdate)
                {
                    return;
                }

                if (_ready)
                {
                    _splash.BeginInvoke(new Action(delegate
                    {
                        _trayIcon.Visible = false;
                        MessageBox.Show(
                            "本地服务已停止运行。",
                            "紫夜公会官网 - 本地版",
                            MessageBoxButtons.OK,
                            MessageBoxIcon.Information
                        );
                        Shutdown();
                    }));
                    return;
                }

                _splash.BeginInvoke(new Action(delegate { ShowStartupFailed(null); }));
            };

            _nodeProcess.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e)
            {
                if (!string.IsNullOrEmpty(e.Data) && e.Data.Contains("ZIYE_READY"))
                {
                    _splash.BeginInvoke(new Action(MarkReady));
                }
            };

            _nodeProcess.BeginOutputReadLine();
            _nodeProcess.BeginErrorReadLine();
        }

        void PollServiceReady()
        {
            if (_ready || _exitingForUpdate)
            {
                return;
            }

            _pollAttempts++;
            if (_pollAttempts > 180)
            {
                ShowStartupFailed("等待服务启动超时。");
                return;
            }

            try
            {
                var request = (HttpWebRequest)WebRequest.Create(AppUrl);
                request.Method = "GET";
                request.Timeout = 1000;
                request.ReadWriteTimeout = 1000;
                using (var response = (HttpWebResponse)request.GetResponse())
                {
                    if ((int)response.StatusCode == 200)
                    {
                        MarkReady();
                    }
                }
            }
            catch
            {
            }
        }

        void MarkReady()
        {
            if (_ready)
            {
                return;
            }

            _ready = true;
            _pollTimer.Stop();

            _statusLabel.Text = "启动成功，已最小化到系统托盘。";
            _splash.Hide();
            _splash.ShowInTaskbar = false;

            _trayIcon.Text = "紫夜公会官网 - 运行中";
            _trayIcon.Visible = true;
            _trayIcon.ShowBalloonTip(
                2500,
                "紫夜公会官网",
                "本地服务已启动，右键托盘图标可退出。",
                ToolTipIcon.Info
            );

            OpenBrowser();
        }

        void ShowStartupFailed(string fallbackMessage)
        {
            if (_ready || _exitingForUpdate)
            {
                return;
            }

            _pollTimer.Stop();
            _splash.Hide();

            var message = ReadErrorMessage(_errorFile);
            if (!string.IsNullOrWhiteSpace(fallbackMessage))
            {
                message = fallbackMessage + "\n\n" + message;
            }

            MessageBox.Show(
                message,
                "紫夜公会官网 - 启动失败",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error
            );

            Shutdown();
        }

        void OpenBrowser()
        {
            try
            {
                Process.Start(new ProcessStartInfo(AppUrl) { UseShellExecute = true });
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "无法打开浏览器：\n" + ex.Message,
                    "紫夜公会官网 - 本地版",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning
                );
            }
        }

        void KillNodeQuiet()
        {
            if (_nodeProcess == null || _nodeProcess.HasExited)
            {
                return;
            }

            try
            {
                var killer = Process.Start(new ProcessStartInfo
                {
                    FileName = "taskkill",
                    Arguments = "/T /F /PID " + _nodeProcess.Id,
                    CreateNoWindow = true,
                    UseShellExecute = false,
                });
                if (killer != null)
                {
                    killer.WaitForExit(3000);
                }
            }
            catch
            {
                try
                {
                    _nodeProcess.Kill();
                }
                catch
                {
                }
            }
        }

        void Shutdown()
        {
            _pollTimer.Stop();
            _trayIcon.Visible = false;
            KillNodeQuiet();
            _trayIcon.Dispose();
            _splash.Dispose();
            ExitThread();
        }

        static string ReadErrorMessage(string errorFile)
        {
            try
            {
                if (File.Exists(errorFile))
                {
                    var content = File.ReadAllText(errorFile, Encoding.UTF8);
                    if (!string.IsNullOrWhiteSpace(content))
                    {
                        if (content.Length > 1800)
                        {
                            content = content.Substring(0, 1800) + "\n\n...(更多内容见 last-error.txt)";
                        }
                        return content;
                    }
                }
            }
            catch
            {
            }

            return "程序异常退出。\n\n请查看安装目录下的 last-error.txt，" +
                   "或 %LOCALAPPDATA%\\ZiyeGuildLocal\\logs\\startup.log 获取详细原因。";
        }
    }

    static class AutoUpdate
    {
        const string VersionFileName = ".bundle-version";
        const string ConfigFileName = "update-config.json";

        public static void EnableTls12()
        {
            try
            {
                ServicePointManager.SecurityProtocol =
                    ServicePointManager.SecurityProtocol | (SecurityProtocolType)3072;
            }
            catch
            {
            }
        }

        public static UpdateCheckResult CheckAndApply(
            string installDir,
            int currentPid,
            Action<string> status,
            bool notifyUpToDate = false
        )
        {
            var config = ReadConfig(installDir);
            if (config == null || !config.Enabled || string.IsNullOrWhiteSpace(config.ManifestUrl))
            {
                return UpdateCheckResult.Skipped;
            }

            if (config.ManifestUrl.IndexOf("替换为", StringComparison.Ordinal) >= 0)
            {
                return UpdateCheckResult.Skipped;
            }

            try
            {
                if (status != null)
                {
                    status("正在检查更新...");
                }

                var manifestJson = DownloadString(config.ManifestUrl, config.TimeoutMs);
                var remoteVersion = ExtractJsonString(manifestJson, "version");
                var downloadUrl = ExtractJsonString(manifestJson, "downloadUrl");
                var sha256 = ExtractJsonString(manifestJson, "sha256");
                var notes = ExtractJsonString(manifestJson, "notes");

                if (string.IsNullOrWhiteSpace(remoteVersion) || string.IsNullOrWhiteSpace(downloadUrl))
                {
                    return UpdateCheckResult.Failed;
                }

                var localVersion = ReadLocalVersion(installDir);
                if (!IsRemoteNewer(remoteVersion, localVersion))
                {
                    if (notifyUpToDate && status != null)
                    {
                        status("已是最新版本");
                    }
                    return UpdateCheckResult.UpToDate;
                }

                if (status != null)
                {
                    status(string.IsNullOrWhiteSpace(notes)
                        ? "发现新版本，正在下载..."
                        : ("发现新版本：" + notes + "\n正在下载..."));
                }

                var workRoot = Path.Combine(
                    Path.GetTempPath(),
                    "ziye-update-" + Guid.NewGuid().ToString("N")
                );
                Directory.CreateDirectory(workRoot);
                var zipPath = Path.Combine(workRoot, "portable.zip");
                var stagingDir = Path.Combine(workRoot, "staging");

                DownloadFile(downloadUrl, zipPath, config.TimeoutMs, status);

                if (!string.IsNullOrWhiteSpace(sha256))
                {
                    var actual = ComputeSha256(zipPath);
                    if (!string.Equals(actual, sha256.Trim(), StringComparison.OrdinalIgnoreCase))
                    {
                        throw new InvalidDataException("更新包校验失败（SHA256 不匹配）");
                    }
                }

                if (status != null)
                {
                    status("正在准备安装更新...");
                }

                Directory.CreateDirectory(stagingDir);
                ZipFile.ExtractToDirectory(zipPath, stagingDir);

                if (!File.Exists(Path.Combine(stagingDir, "紫夜官网.exe")) &&
                    !File.Exists(Path.Combine(stagingDir, "launcher.cjs")))
                {
                    throw new InvalidDataException("更新包内容无效，缺少启动文件");
                }

                File.WriteAllText(
                    Path.Combine(stagingDir, VersionFileName),
                    remoteVersion.Trim(),
                    Encoding.UTF8
                );

                // 保留现有数据库凭据，避免更新覆盖成员本机已改的 .env
                PreserveServerEnv(installDir, stagingDir);

                var scriptPath = Path.Combine(workRoot, "apply-update.cmd");
                WriteApplyScript(scriptPath, currentPid, stagingDir, installDir, remoteVersion.Trim());

                var startInfo = new ProcessStartInfo
                {
                    FileName = scriptPath,
                    WorkingDirectory = workRoot,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    WindowStyle = ProcessWindowStyle.Hidden,
                };
                Process.Start(startInfo);

                if (status != null)
                {
                    status("更新已下载，正在重启...");
                }

                return UpdateCheckResult.Restarting;
            }
            catch
            {
                return UpdateCheckResult.Failed;
            }
        }

        static void PreserveServerEnv(string installDir, string stagingDir)
        {
            var currentEnv = Path.Combine(installDir, "app", "server", ".env");
            var stagingEnv = Path.Combine(stagingDir, "app", "server", ".env");
            if (File.Exists(currentEnv) && Directory.Exists(Path.GetDirectoryName(stagingEnv)))
            {
                File.Copy(currentEnv, stagingEnv, true);
            }
        }

        static void WriteApplyScript(
            string scriptPath,
            int pid,
            string stagingDir,
            string installDir,
            string version
        )
        {
            var sb = new StringBuilder();
            sb.AppendLine("@echo off");
            sb.AppendLine("setlocal EnableDelayedExpansion");
            sb.AppendLine("set \"PID=" + pid + "\"");
            sb.AppendLine("set \"STAGING=" + stagingDir + "\"");
            sb.AppendLine("set \"INSTALL=" + installDir + "\"");
            sb.AppendLine("set \"VERSION=" + version.Replace("\"", "") + "\"");
            sb.AppendLine("set LOOPS=0");
            sb.AppendLine(":wait");
            sb.AppendLine("tasklist /FI \"PID eq %PID%\" 2>NUL | find \"%PID%\" >NUL");
            sb.AppendLine("if not errorlevel 1 (");
            sb.AppendLine("  ping 127.0.0.1 -n 2 >NUL");
            sb.AppendLine("  set /a LOOPS+=1");
            sb.AppendLine("  if !LOOPS! GEQ 30 (");
            sb.AppendLine("    taskkill /F /PID %PID% >NUL 2>&1");
            sb.AppendLine("    ping 127.0.0.1 -n 2 >NUL");
            sb.AppendLine("    goto copyfiles");
            sb.AppendLine("  )");
            sb.AppendLine("  goto wait");
            sb.AppendLine(")");
            sb.AppendLine(":copyfiles");
            sb.AppendLine("ping 127.0.0.1 -n 2 >NUL");
            sb.AppendLine("robocopy \"%STAGING%\" \"%INSTALL%\" /E /IS /IT /R:5 /W:1 /NFL /NDL /NJH /NJS /nc /ns /np >NUL");
            sb.AppendLine("echo %VERSION%> \"%INSTALL%\\.bundle-version\"");
            sb.AppendLine("start \"\" \"%INSTALL%\\紫夜官网.exe\"");
            sb.AppendLine("rd /s /q \"%STAGING%\" >NUL 2>&1");
            sb.AppendLine("del \"%~f0\" >NUL 2>&1");
            File.WriteAllText(scriptPath, sb.ToString(), Encoding.Default);
        }

        sealed class UpdateConfig
        {
            public bool Enabled;
            public string ManifestUrl;
            public int TimeoutMs;
        }

        static UpdateConfig ReadConfig(string installDir)
        {
            var path = Path.Combine(installDir, ConfigFileName);
            if (!File.Exists(path))
            {
                return null;
            }

            try
            {
                var json = File.ReadAllText(path, Encoding.UTF8);
                var enabledRaw = ExtractJsonRaw(json, "enabled");
                var enabled = enabledRaw == null ||
                              enabledRaw.Equals("true", StringComparison.OrdinalIgnoreCase);

                var timeoutRaw = ExtractJsonRaw(json, "checkTimeoutMs");
                var timeout = 15000;
                if (!string.IsNullOrWhiteSpace(timeoutRaw))
                {
                    int.TryParse(timeoutRaw, out timeout);
                    if (timeout < 3000)
                    {
                        timeout = 3000;
                    }
                }

                return new UpdateConfig
                {
                    Enabled = enabled,
                    ManifestUrl = ExtractJsonString(json, "manifestUrl"),
                    TimeoutMs = timeout,
                };
            }
            catch
            {
                return null;
            }
        }

        static string ReadLocalVersion(string installDir)
        {
            var path = Path.Combine(installDir, VersionFileName);
            if (!File.Exists(path))
            {
                return string.Empty;
            }

            try
            {
                return File.ReadAllText(path, Encoding.UTF8).Trim();
            }
            catch
            {
                return string.Empty;
            }
        }

        public static bool IsRemoteNewer(string remoteVersion, string localVersion)
        {
            if (string.IsNullOrWhiteSpace(remoteVersion))
            {
                return false;
            }

            if (string.IsNullOrWhiteSpace(localVersion))
            {
                return true;
            }

            var remote = remoteVersion.Trim();
            var local = localVersion.Trim();
            if (string.Equals(remote, local, StringComparison.Ordinal))
            {
                return false;
            }

            DateTime remoteTime;
            DateTime localTime;
            if (DateTime.TryParse(remote, out remoteTime) && DateTime.TryParse(local, out localTime))
            {
                return remoteTime > localTime;
            }

            return string.CompareOrdinal(remote, local) > 0;
        }

        static string DownloadString(string url, int timeoutMs)
        {
            var request = (HttpWebRequest)WebRequest.Create(url);
            request.Method = "GET";
            request.Timeout = timeoutMs;
            request.ReadWriteTimeout = timeoutMs;
            request.UserAgent = "ZiyeGuildLocalUpdater/1.0";
            request.AutomaticDecompression = DecompressionMethods.GZip | DecompressionMethods.Deflate;

            using (var response = (HttpWebResponse)request.GetResponse())
            using (var stream = response.GetResponseStream())
            using (var reader = new StreamReader(stream, Encoding.UTF8))
            {
                return reader.ReadToEnd();
            }
        }

        static void DownloadFile(string url, string destination, int timeoutMs, Action<string> status)
        {
            var request = (HttpWebRequest)WebRequest.Create(url);
            request.Method = "GET";
            request.Timeout = Math.Max(timeoutMs, 60000);
            request.ReadWriteTimeout = Math.Max(timeoutMs, 60000);
            request.UserAgent = "ZiyeGuildLocalUpdater/1.0";
            request.AutomaticDecompression = DecompressionMethods.None;

            using (var response = (HttpWebResponse)request.GetResponse())
            using (var input = response.GetResponseStream())
            using (var output = File.Create(destination))
            {
                if (input == null)
                {
                    throw new IOException("下载流为空");
                }

                var total = response.ContentLength;
                var buffer = new byte[81920];
                long readTotal = 0;
                int read;
                var lastReport = DateTime.MinValue;

                while ((read = input.Read(buffer, 0, buffer.Length)) > 0)
                {
                    output.Write(buffer, 0, read);
                    readTotal += read;

                    if (status != null && total > 0 && (DateTime.UtcNow - lastReport).TotalMilliseconds > 400)
                    {
                        lastReport = DateTime.UtcNow;
                        var percent = (int)(readTotal * 100 / total);
                        status("正在下载更新... " + percent + "%");
                    }
                }
            }
        }

        static string ComputeSha256(string filePath)
        {
            using (var stream = File.OpenRead(filePath))
            using (var sha = SHA256.Create())
            {
                var hash = sha.ComputeHash(stream);
                var sb = new StringBuilder(hash.Length * 2);
                for (var i = 0; i < hash.Length; i++)
                {
                    sb.Append(hash[i].ToString("x2"));
                }
                return sb.ToString();
            }
        }

        static string ExtractJsonString(string json, string key)
        {
            if (string.IsNullOrEmpty(json) || string.IsNullOrEmpty(key))
            {
                return null;
            }

            var match = Regex.Match(
                json,
                "\"" + Regex.Escape(key) + "\"\\s*:\\s*\"((?:\\\\.|[^\"\\\\])*)\"",
                RegexOptions.CultureInvariant
            );
            if (!match.Success)
            {
                return null;
            }

            return Regex.Unescape(match.Groups[1].Value);
        }

        static string ExtractJsonRaw(string json, string key)
        {
            if (string.IsNullOrEmpty(json) || string.IsNullOrEmpty(key))
            {
                return null;
            }

            var match = Regex.Match(
                json,
                "\"" + Regex.Escape(key) + "\"\\s*:\\s*([^,\\}\\s]+)",
                RegexOptions.CultureInvariant
            );
            return match.Success ? match.Groups[1].Value.Trim() : null;
        }
    }
}
