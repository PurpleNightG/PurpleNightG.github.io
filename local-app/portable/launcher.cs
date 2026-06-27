using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Text;
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

    sealed class TrayApplicationContext : ApplicationContext
    {
        const string AppUrl = "http://127.0.0.1:3001/";

        readonly string _baseDir;
        readonly string _errorFile;
        readonly NotifyIcon _trayIcon;
        readonly Form _splash;
        readonly Label _statusLabel;
        readonly System.Windows.Forms.Timer _pollTimer;

        Process _nodeProcess;
        bool _ready;
        int _pollAttempts;

        public TrayApplicationContext(string baseDir, string nodeExe, string launcherScript)
        {
            _baseDir = baseDir;
            _errorFile = Path.Combine(baseDir, "last-error.txt");

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
                Text = "正在启动，请稍候...",
                Dock = DockStyle.Fill,
                TextAlign = ContentAlignment.MiddleCenter,
            };
            _splash.Controls.Add(_statusLabel);
            _splash.Show();

            _trayIcon = CreateTrayIcon();
            _trayIcon.Visible = false;

            _pollTimer = new System.Windows.Forms.Timer { Interval = 500 };
            _pollTimer.Tick += delegate { PollServiceReady(); };

            StartNodeProcess(nodeExe, launcherScript);
            _pollTimer.Start();
        }

        NotifyIcon CreateTrayIcon()
        {
            var trayIcon = new NotifyIcon
            {
                Text = "紫夜公会官网 - 运行中",
            };

            var iconPath = Path.Combine(_baseDir, "app.ico");
            if (File.Exists(iconPath))
            {
                trayIcon.Icon = new Icon(iconPath);
            }
            else
            {
                trayIcon.Icon = SystemIcons.Application;
            }

            var menu = new ContextMenuStrip();
            menu.Items.Add("打开网站", null, delegate { OpenBrowser(); });
            menu.Items.Add("退出", null, delegate { Shutdown(); });
            trayIcon.ContextMenuStrip = menu;
            trayIcon.DoubleClick += delegate { OpenBrowser(); };

            return trayIcon;
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
            if (_ready)
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
            if (_ready)
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

        void Shutdown()
        {
            _pollTimer.Stop();
            _trayIcon.Visible = false;

            if (_nodeProcess != null && !_nodeProcess.HasExited)
            {
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
}
