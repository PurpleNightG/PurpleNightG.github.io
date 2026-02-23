# 一些关于本游戏的小问题

## 我该使用什么加速器？

你可以去各知名加速器官网下载安装包，加速Steam，确保Steam稳定在线。

**推荐加速器：**

<a href="https://www.leigod.com/" target="_blank" rel="noopener noreferrer" class="doc-card">
  <div class="doc-card-title">雷神加速器</div>
  <div class="doc-card-desc">专业游戏加速器，支持直接加速游戏</div>
</a>

<a href="https://www.xunyou.com/" target="_blank" rel="noopener noreferrer" class="doc-card">
  <div class="doc-card-title">迅游加速器</div>
  <div class="doc-card-desc">老牌游戏加速器，稳定可靠</div>
</a>

<a href="https://uu.163.com/" target="_blank" rel="noopener noreferrer" class="doc-card">
  <div class="doc-card-title">网易UU加速器</div>
  <div class="doc-card-desc">网易出品，性能优秀</div>
</a>

或者你可以尝试使用你自己的加速器加速Steam，若无法进入房间，可尝试将节点更换为**登录失败/异常专用**。除了雷神加速器可以直接加速游戏之外，其他加速器我们都建议只加速Steam。

## 我安装了模组但不生效

请确认你将模组安装在了Paks文件夹内，且是后缀为.pak的白块文件，而并非压缩包。  
若是模组冲突导致不生效的问题，那就请你一个一个删除试着吧。  
若是模组过旧，也会产生这种问题，尝试去官网寻找它的最新版本！

## 加入房间显示无法连接至主办者

如果你确认不是房主卡房，重新开放或其他人能进入此房间，那么请检查你是否加速Steam，若加速Steam无效，请尝试切换至**登录失败/异常专用**节点。切换后需重启游戏，若仍然失效，那么请大退Steam再重新启动Steam后启动游戏。

## 加入他人房间/创建房间没反应

这个问题是由于 **pakchunk99-Mod_PlayerLimitEditor.pak** 模组造成的，在之前的版本中出现过此类问题，现在作者已经修复了此类Bug。你可以去NexusMods下载最新版本的模组。

此外，如果你还是无法创建房间，那么可能是由于运营商拦截，请尝试以下方法：
> 开始之前，请确保加速器正在加速Steam，保证Steam稳定在线。

1. 退出Steam，使Steam处于关闭状态。
2. 找到游戏根目录（方法同上），进入 `ReadyOrNot\Binaries\Win64` 文件夹内。
3. 找到游戏主进程 **ReadyOrNotSteam-Win64-Shipping.exe** ，打开它。
<img src="https://s41.ax1x.com/2026/01/25/pZ2sSv8.png" alt="游戏根目录">

4. 待游戏进入主界面后，会提示 **无法连接至EPIC服务。请稍后重试**。点击 **好** 即可。
<img src="https://s41.ax1x.com/2026/01/25/pZ2s9KS.png" alt="无法连接至EPIC服务">

5. 打开Steam，等待Steam进入主页。
6. 在游戏中的多人游戏选项，选择 **重新连接EPIC SERVERS**。
<img src="https://s41.ax1x.com/2026/01/25/pZ2sPbQ.png" alt="重新连接EPIC SERVERS">

现在你应该可以创建房间了。

当然，如果你认为此方法过于繁琐，那么可以试一下紫夜出品的**严阵以待进房修复启动程序**。

<a href="https://wwbji.lanzoue.com/b0139joxyf" target="_blank" rel="noopener noreferrer" class="doc-card">
  <div class="doc-card-title">严阵以待进房修复启动程序</div>
  <div class="doc-card-desc">修复进房失败问题（访问密码：ndyian）</div>
</a>

使用方法如下：
1. 下载后解压
2. 将主程序**RON快速启动工具.exe**放在一个文件夹内，并创建桌面快捷方式。
<img src="https://s41.ax1x.com/2026/02/23/pZjxSMR.png" alt="RON快速启动工具">

3. 首次启动程序，将会让你选择游戏启动后间隔多久启动Steam **（弹窗仅会在第一次启动时弹出）**。因为每个电脑性能不同，启动游戏的时间也大不相同，所以请根据你的电脑性能选择一个合适的间隔时间。要确保游戏完全启动后再启动Steam，默认15秒，我认为大部分都合适。
<img src="https://s41.ax1x.com/2026/02/23/pZjvxz9.png" alt="RON快速启动工具">

4. 点击**确定**，程序将会启动游戏，待游戏启动后，程序会自动启动Steam。之后进入游戏操作同上个小节**加入他人房间/创建房间没反应一致**。

> 如果你需要更换间隔时间，请进入程序所在文件夹内，删除生成的 **quick_launch_config.json** 文件，然后重新启动程序即可。