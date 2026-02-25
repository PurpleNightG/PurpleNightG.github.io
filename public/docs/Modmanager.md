# 严阵以待模组管理器介绍
![模组管理器](/img/ModManagerIntroduce/模组管理器.png)
经过1代大更及8代小更，我们的模组管理器较上代新增了6个功能，修复了若干个已知问题。
接下来我将详细介绍模组管理器的主要功能

> 由于安装包变更，安装时可能不会自动读取原路径，因此您无法进行覆盖安装，否则将会导致卸载不完全。请先卸载原有版本，如须保留配置文件，请打开软件安装根目录，备份根目录下的config文件夹，在安装完新版本后重新覆盖新目录下的config文件夹即可。
<img src="/img/ModManagerIntroduce/目录结构.png" alt="目录结构" width="500px">

---

## 添加功能

### 模组

您可通过顶部菜单栏中 `文件 > 添加模组` 来进行模组的添加。
<img src="/img/ModManagerIntroduce/添加模组菜单.png" alt="添加模组菜单" width="500px">
<!-- ![添加模组菜单](/img/ModManagerIntroduce/添加模组菜单.png) -->

也可以通过点击页面正下方的 `添加模组` 按钮来进行模组的添加。
![添加模组按钮](/img/ModManagerIntroduce/添加模组按钮.png)

也可以通过拖动模组文件到**窗口**来进行模组的添加
![拖动安装模组](/img/ModManagerIntroduce/拖动添加模组窗口.png)

也可以将模组拖动到**桌面快捷方式**上来进行快捷安装

### 预加载/存档

预加载又被称为存档，在安装部分地图时，地图作者有时会给予预加载文件，方便快速加载地图。

添加预加载的方式与添加模组雷同，在此不过多赘述。

### 智能添加模组与预加载

您可以尝试将模组文件和预加载文件一起拖动进软件主窗口，程序将自动识别预加载与模组的关系，并自动添加到正确位置。
![智能添加模组与预加载](/img/ModManagerIntroduce/智能添加窗口.png)

---

## 模组管理

### 启用/禁用相关文件

您可以尝试拖动模组列表中的文件到启用、禁用列表，进行模组的快速启用与禁用调整。
> 按住 `Ctrl` 点按是多选，按住 `Shift` 可范围选择

右键列表中的任意模组，选择 `禁用` 或 `启用` 可达到同样效果。
<img src="/img/ModManagerIntroduce/禁用模组右键菜单.png" alt="禁用模组右键菜单" width="500px">
<!-- ![禁用模组右键菜单](/img/ModManagerIntroduce/禁用模组右键菜单.png) -->

### 定位文件所在位置

右键列表中的任意模组，点击 `定位文件所在位置` 即可自动打开文件夹并高亮文件。
<img src="/img/ModManagerIntroduce/定位文件所在位置.png" alt="定位文件所在位置" width="500px">
<!-- ![定位文件所在位置](/img/ModManagerIntroduce/定位文件所在位置.png) -->

### 复制文件名

右键列表中的任意模组，点击 `复制文件名` 即可复制文件的原始名称。
![复制文件名](/img/ModManagerIntroduce/复制文件名.png)

### 查看详情/添加备注

右键列表中的任意模组，点击 `查看详情` 即可查看模组详细信息，并添加备注。
<img src="/img/ModManagerIntroduce/查看详情.png" alt="查看详情" width="800px">
<!-- ![查看详情](/img/ModManagerIntroduce/查看详情.png) -->

### 重命名文件

右键列表中的任意模组，点击 `重命名文件` 即可重命名文件。程序将智能识别名称前缀与后缀，以免错误修改致使模组失效。
<img src="/img/ModManagerIntroduce/重命名模组.png" alt="重命名模组" width="500px">
<!-- ![重命名文件](/img/ModManagerIntroduce/重命名模组.png) -->

### 重命名显示名称

右键列表中的任意模组，点击 `重命名显示名称` 即可重命名文件在软件内的显示名称，不会改动文件名称。
<img src="/img/ModManagerIntroduce/重命名显示名称.png" alt="重命名显示名称" width="500px">
<!-- ![重命名显示名称](/img/ModManagerIntroduce/重命名显示名称.png) -->

### 设置分类

右键列表中的任意模组，点击 `重命名显示名称` 即可快速设置分类。（需要先创建分类）
<img src="/img/ModManagerIntroduce/设置分类.png" alt="设置分类" width="500px">
<!-- ![设置分类](/img/ModManagerIntroduce/设置分类.png) -->

### 删除

右键列表中的任意模组，点击 `删除` 即可快速删除选中模组。

<div class="note info">
以上所有操作均可通过 <kbd>Ctrl</kbd> 和 <kbd>Shift</kbd> 进行多选处理
</div>

---

## 预加载管理

所有操作同模组管理一致，在此不过多赘述。

---

## 预设管理

### 添加预设
在软件页面中，先调整好想要启用和禁用的模组，然后点击 `管理预设` > `添加当前配置` 即可完成预设的保存。
<img src="/img/ModManagerIntroduce/添加预设.png" alt="添加预设" width="500px">
<!-- ![添加预设](/img/ModManagerIntroduce/添加预设.png) -->

### 切换预设
在软件主页面中，点击 `<当前配置>` 下拉框即可调整预设。
![切换预设](/img/ModManagerIntroduce/调整预设.png)

---

## 搜索

点击搜索框搜索模组，即可模糊搜索所有匹配模组。

---

## 分类管理

### 添加分类

可通过点击 `管理分类` > `添加分类` 来进行分类的添加
<img src="/img/ModManagerIntroduce/添加分类.png" alt="添加分类" width="500px">
<!-- ![添加分类](/img/ModManagerIntroduce/添加分类.png) -->

### 智能添加文件结构分类

程序将自动读取模组文件夹内的结构来创建分类。例如，您的地图类mod均放在模组文件夹内的地图文件夹中，结构也就是 `Paks > 地图` ，那么程序将自动读取您的子文件夹名称作为分类名称。根据此例，程序将自动创建名为**地图**的分类。

可通过点击 `管理分类` > `从文件夹导入` 来进行分类的智能添加。

<div class="note warning">
您需要点击<b>确定</b>，分类编辑才会生效！
</div>

### 分类筛选

创建完分类后，您可在软件主页面中，点击 `全部` 下拉框，来选择分类进行快速筛选。
![分类筛选](/img/ModManagerIntroduce/分类筛选.png)

### 清理无效项

分类创建后，如果模组路径产生变动，必定会导致部分分类失效。您可以通过点击 `管理分类` > `清理无效项` 进行快速清理。当然您也可以点击 `管理分类项` 来详细查看哪个模组路径错误。
<img src="/img/ModManagerIntroduce/清理无效项.png" alt="清理无效项" width="500px">
<!-- ![清理无效项](/img/ModManagerIntroduce/清理无效项.png) -->

### 虚拟树状结构

针对非子目录的分类，可采用虚拟树状结构来使整个结构更整齐美观。您可以通过右键未在子目录的分类文件 `调整树形结构` 进行虚拟树形结构的调整
<img src="/img/ModManagerIntroduce/调整树形结构.png" alt="调整树形结构" width="500px">

<!-- ![调整树形结构](/img/ModManagerIntroduce/调整树形结构.png) -->
![调整树形结构](/img/ModManagerIntroduce/调整树形结构详细.png)

---

## 音频管理
![音频管理](/img/ModManagerIntroduce/音频管理.png)
在大补丁#3后语音mod不用再打包了。现在的音频模组都采用了PAK的模组文件可直接添加，但如果你想使用旧版本的音频文件，可以在 `游戏根目录\ReadyOrNot\Content` 下新建一个文件夹 `VO_MOD` ，然后把你的语音mod文件夹（也就是7月份LSS更新之前的那种样式）放到 `VO_MOD` 下。你的语音mod路径应该像这样：

```
游戏根目录\ReadyOrNot\Content\VO_MOD\SWATJudge
```
这样可以做到完全覆盖原有语音。

当然在模组管理器中也集成了此功能，具体介绍如下。

### 添加音频文件夹

点击此按钮后，若您未创建此文件夹，程序将自动帮您创建。然后您可以通过将音频文件夹**直接拖入主窗口**或**点击添加音频文件夹**来完成对音频文件的替换添加。
![添加音频文件夹](/img/ModManagerIntroduce/添加音频文件夹.png)

<div class="note warning">
请注意！不是将音频文件拖入，而是将整个音频文件夹拖入！在严阵以待的VO目录中，存在着相同的文件夹，拖入到VO_MOD文件夹意味着优先执行VO_MOD文件夹中与VO文件夹内同名的音频文件而不再执行VO原版音频文件。
</div>

---

## 备份与恢复

![备份管理](/img/ModManagerIntroduce/备份管理.png)

### 备份

您可以在页面上方选择需要备份的文件，下面进行逐一解释：

| 设置项    | 程序所做操作                     |
|---------|-----------------------------------|
| 备份模组    | 备份模组文件夹下的所有内容                 |
| 备份预加载   | 备份预加载文件夹下的所有内容                    |
| 备份全游戏配置 | 备份了整个config文件夹，包含了按键以及游戏设置        |
| 备份按键配置  | 备份config文件夹下的Input.ini            |
| 备份游戏设置  | 备份config文件夹下的GameUserSettings.ini |
| 备份配装设置  | 备份预加载目录下的MetaGameProfile.sav      |
| 备份AI音频  | 备份创建的VO_MOD文件夹（需选择）               |

选择完备份项，可重命名备份的名称，点击 `创建备份` 即可完成对备份的创建。
![创建备份](/img/ModManagerIntroduce/创建备份.png)

### 还原备份

在下方选择需要恢复的备份项，并点击 `还原选中备份` 即可完成备份的恢复。
![还原备份](/img/ModManagerIntroduce/还原备份.png)

---

## 杂项菜单

![菜单](/img/ModManagerIntroduce/菜单.png)

### 文件操作

#### 显示拖放浮窗

可将模组或预加载文件拖动到拖放浮窗以完成对模组的快速安装。
<img src="/img/ModManagerIntroduce/拖放浮窗.png" alt="拖放浮窗" width="500px">
<!-- ![拖放浮窗](/img/ModManagerIntroduce/拖放浮窗.png) -->

#### 关闭最小化到托盘

程序关闭时并不直接退出，可最小化到系统托盘。
<img src="/img/ModManagerIntroduce/系统托盘.png" alt="系统托盘" width="500px">
<!-- ![最小化到托盘](/img/ModManagerIntroduce/系统托盘.png) -->

### 工具类

#### 一键解锁全DLC

<div class="note danger">
此功能仅用于学习讨论，请勿用作商业用途！请勿在任何渠道受骗付费购买！如有受骗请直接举报和退款！有能力的话不如补票支持开发者！
</div>
点击后将自动释放DLC破解补丁，完成对DLC的破解。

<img src="/img/ModManagerIntroduce/DLC解锁.png" alt="DLC解锁" width="800px">

> 本功能作者：B站 非线性列车

<div class="note warning">
请注意！释放的DLC补丁容易被杀毒软件误报为病毒或可以程序，请添加至白名单或信任区！
</div>

#### 启动动画禁用与启用

禁用游戏启动动画将加快游戏启动速度约4秒，可根据喜好选择启用或禁用。
<img src="/img/ModManagerIntroduce/启用启动动画.png" alt="启用启动动画" width="300px">
<!-- ![启用启动动画](/img/ModManagerIntroduce/启用启动动画.png) -->

#### 替换启动动画

可根据喜好替换成自己想要的启动动画。
<img src="/img/ModManagerIntroduce/替换启动动画.png" alt="替换启动动画" width="300px">
<!-- ![替换启动动画](/img/ModManagerIntroduce/替换启动动画.png) -->

#### 游戏画质优化

根据画质修改提升游戏帧率。
<img src="/img/ModManagerIntroduce/游戏画质优化.png" alt="游戏画质优化" width="800px">
<!-- ![游戏画质优化](/img/ModManagerIntroduce/游戏画质优化.png) -->

#### 帧数大幅优化

修改UE逻辑，提升帧率。
<img src="/img/ModManagerIntroduce/帧数大幅优化.png" alt="帧数大幅优化" width="800px">
<!-- ![帧数大幅优化](/img/ModManagerIntroduce/帧数大幅优化.png) -->

---

## 按键配置编辑器

![按键配置编辑器](/img/ModManagerIntroduce/按键配置编辑器.png)

有部分用户反馈，在进入游戏后按键总是被重置，对此在按键配置编辑器中添加了 `锁定配置` 选项，以防止在修改后进入游戏按键配置改变。

---

# 赞助&声明

《严阵以待》模组管理器 使用声明

软件名称：严阵以待模组管理器（Ready or Not Mod Manager）

作者：鲶大禹

所属公会：紫夜公会（Purple Night Games）

官网：https://purplenightg.github.io/

社群标识：QQ群 618628062

使用条款：
## 著作权声明
- 本软件及其所有相关代码、设计、文档均受著作权法保护，所有权利归属于作者**鲶大禹**。

## 非商用授权
本软件永久免费提供给用户使用，严禁任何形式的商业行为，包括但不限于：
- 直接售卖本软件或修改版本
- 将本软件作为商业服务的组成部分
- 通过本软件获取直接经济利益

## 使用限制
禁止对软件进行恶意篡改、逆向工程、功能破解，或用于违反国家法律法规及游戏用户协议的行为。

## 传播规范
允许非商业目的的转载分享，必须同时包含以下完整信息：
- 原始软件名称《严阵以待模组管理器》
- 作者署名 鲶大禹
- 紫夜公会归属声明（QQ群：618628062）
- 本文档原始声明链接（若适用）

## 免责条款
本软件按"现状"提供，作者及紫夜公会不承担因使用软件导致的游戏异常、数据丢失或设备故障等责任。用户需自行承担使用风险。

## 衍生作品
基于本软件核心功能二次开发的衍生作品，必须公开源码并明确标注原始作者及版权归属，且同样受非商用条款约束。

开发者联系方式：

通过紫夜公会官方QQ群 618628062 反馈问题

声明更新日期：2025年7月13日

## 赞助

本软件完全免费提供给所有用户使用，无任何强制收费功能。如果你觉得本软件对你有帮助，可以通过**自愿**赞助的方式支持我们继续维护与更新，你的每一份支持都是我们前进的动力。

<table>
  <tr>
    <td style="text-align: center; padding: 10px;">
      <img src="/img/ModManagerIntroduce/微信支付.png" alt="微信支付" width="400px">
      <p>微信支付</p>
    </td>
    <td style="text-align: center; padding: 10px;">
      <img src="/img/ModManagerIntroduce/支付宝支付.png" alt="支付宝支付" width="400px">
      <p>支付宝支付</p>
    </td>
  </tr>
</table>