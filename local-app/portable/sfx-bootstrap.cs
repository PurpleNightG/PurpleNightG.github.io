using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace ZiyeGuildSfx
{
    static class Program
    {
        const string Marker = "ZIYEZIP!";
        const string InstallFolder = "ZiyeGuildLocal";
        const string AppExeName = "紫夜官网.exe";
        const string VersionFileName = ".bundle-version";

        [STAThread]
        static void Main()
        {
            var installDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                InstallFolder
            );
            var appExe = Path.Combine(installDir, AppExeName);
            var selfPath = Assembly.GetExecutingAssembly().Location;

            try
            {
                var bundleVersion = ReadBundleVersion(selfPath);
                var installedVersion = ReadInstalledVersion(installDir);

                if (!File.Exists(appExe) || installedVersion != bundleVersion)
                {
                    if (!ExtractBundle(selfPath, installDir, bundleVersion))
                    {
                        return;
                    }
                }

                LaunchApp(appExe, installDir);
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "启动失败：\n" + ex.Message,
                    "紫夜公会官网 - 本地版",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
            }
        }

        static void LaunchApp(string appExe, string installDir)
        {
            var mutexName = "Global\\ZiyeGuildLocalApp";
            bool createdNew;
            using (var mutex = new Mutex(true, mutexName, out createdNew))
            {
                if (!createdNew)
                {
                    try
                    {
                        Process.Start(new ProcessStartInfo("http://127.0.0.1:3001/")
                        {
                            UseShellExecute = true
                        });
                    }
                    catch
                    {
                        MessageBox.Show(
                            "程序已在运行中。\n请在浏览器访问：http://127.0.0.1:3001/",
                            "紫夜公会官网 - 本地版",
                            MessageBoxButtons.OK,
                            MessageBoxIcon.Information
                        );
                    }
                    return;
                }

                var startInfo = new ProcessStartInfo
                {
                    FileName = appExe,
                    WorkingDirectory = installDir,
                    UseShellExecute = true
                };

                Process.Start(startInfo);
            }
        }

        static bool ExtractBundle(string selfPath, string installDir, string bundleVersion)
        {
            using (var form = new Form())
            using (var label = new Label())
            {
                form.Text = "紫夜公会官网 - 本地版";
                form.FormBorderStyle = FormBorderStyle.FixedDialog;
                form.StartPosition = FormStartPosition.CenterScreen;
                form.MaximizeBox = false;
                form.MinimizeBox = false;
                form.ClientSize = new System.Drawing.Size(420, 120);

                label.AutoSize = false;
                label.Text = "首次运行，正在初始化本地文件...\n请稍候，大约需要 10-30 秒。";
                label.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;
                label.Dock = DockStyle.Fill;
                form.Controls.Add(label);
                form.Shown += delegate { form.Refresh(); };

                var worker = new Thread(delegate()
                {
                    try
                    {
                        ExtractZipPayload(selfPath, installDir, bundleVersion);
                        form.Invoke(new Action(delegate()
                        {
                            form.DialogResult = DialogResult.OK;
                            form.Close();
                        }));
                    }
                    catch (Exception ex)
                    {
                        form.Invoke(new Action(delegate()
                        {
                            MessageBox.Show(
                                "初始化失败：\n" + ex.Message,
                                "紫夜公会官网 - 本地版",
                                MessageBoxButtons.OK,
                                MessageBoxIcon.Error
                            );
                            form.DialogResult = DialogResult.Cancel;
                            form.Close();
                        }));
                    }
                });

                worker.IsBackground = true;
                worker.Start();
                return form.ShowDialog() == DialogResult.OK;
            }
        }

        static void ExtractZipPayload(string selfPath, string installDir, string bundleVersion)
        {
            var payload = ReadEmbeddedZip(selfPath);
            if (Directory.Exists(installDir))
            {
                Directory.Delete(installDir, true);
            }
            Directory.CreateDirectory(installDir);

            var tempZip = Path.Combine(Path.GetTempPath(), "ziye-guild-" + Guid.NewGuid().ToString("N") + ".zip");
            try
            {
                File.WriteAllBytes(tempZip, payload);
                ZipFile.ExtractToDirectory(tempZip, installDir);
                File.WriteAllText(
                    Path.Combine(installDir, VersionFileName),
                    bundleVersion,
                    Encoding.UTF8
                );
            }
            finally
            {
                if (File.Exists(tempZip))
                {
                    File.Delete(tempZip);
                }
            }
        }

        const int FixedFooterSize = 16; // MARKER(8) + zipSize(4) + versionLength(4)

        static void ReadFooterMetadata(BinaryReader reader, FileStream stream, out uint zipSize, out uint versionLength)
        {
            stream.Seek(-Marker.Length, SeekOrigin.End);
            var markerBytes = reader.ReadBytes(Marker.Length);
            var markerText = Encoding.ASCII.GetString(markerBytes);
            if (markerText != Marker)
            {
                throw new InvalidDataException("未找到有效的内置数据，请重新下载安装包。");
            }

            stream.Seek(-FixedFooterSize, SeekOrigin.End);
            versionLength = reader.ReadUInt32();
            zipSize = reader.ReadUInt32();
        }

        static byte[] ReadEmbeddedZip(string selfPath)
        {
            using (var stream = new FileStream(selfPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
            using (var reader = new BinaryReader(stream))
            {
                if (stream.Length < FixedFooterSize + 1)
                {
                    throw new InvalidDataException("单文件安装包已损坏。");
                }

                uint zipSize;
                uint versionLength;
                ReadFooterMetadata(reader, stream, out zipSize, out versionLength);

                if (zipSize <= 0 || versionLength <= 0 || versionLength > 256)
                {
                    throw new InvalidDataException("内置数据大小无效。");
                }

                var payloadOffset = stream.Length - FixedFooterSize - versionLength - zipSize;
                if (payloadOffset < 0)
                {
                    throw new InvalidDataException("单文件安装包结构异常。");
                }

                stream.Seek(payloadOffset, SeekOrigin.Begin);
                return reader.ReadBytes((int)zipSize);
            }
        }

        static string ReadBundleVersion(string selfPath)
        {
            using (var stream = new FileStream(selfPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
            using (var reader = new BinaryReader(stream))
            {
                if (stream.Length < FixedFooterSize + 1)
                {
                    return "unknown";
                }

                uint zipSize;
                uint versionLength;
                ReadFooterMetadata(reader, stream, out zipSize, out versionLength);

                if (versionLength <= 0 || versionLength > 256)
                {
                    return "unknown";
                }

                var versionOffset = stream.Length - FixedFooterSize - versionLength;
                stream.Seek(versionOffset, SeekOrigin.Begin);
                var versionBytes = reader.ReadBytes((int)versionLength);
                return Encoding.UTF8.GetString(versionBytes);
            }
        }

        static string ReadInstalledVersion(string installDir)
        {
            var versionFile = Path.Combine(installDir, VersionFileName);
            if (!File.Exists(versionFile))
            {
                return string.Empty;
            }

            return File.ReadAllText(versionFile, Encoding.UTF8).Trim();
        }
    }
}
