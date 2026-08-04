#!/usr/bin/env python3
"""Migrate admin pages to student-glass CSS classes."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ADMIN = ROOT / "src" / "pages" / "admin"

GLASS_PANEL = "student-glass-panel student-glass-panel--static"
GLASS_CHIP = "student-glass-chip"


def strip_glass_redundant_classes(s: str) -> str:
    """Remove Tailwind classes superseded by glass panel/chip."""
    redundant = [
        r"\bbackdrop-blur-sm\b",
        r"\bbackdrop-blur-md\b",
        r"\bbackdrop-blur\b",
        r"\brounded-xl\b",
        r"\brounded-lg\b",
        r"\bborder\s+border-gray-700(?:/\d+)?\b",
        r"\bborder-gray-700(?:/\d+)?\b",
        r"\bbg-gray-800/\d+\b",
        r"\bbg-gray-900/\d+\b",
        r"\bbg-gray-800\b(?!\/)",  # solid bg-gray-800 not followed by /
    ]
    for pat in redundant:
        s = re.sub(pat, "", s)
    s = re.sub(r"\s{2,}", " ", s).strip()
    return s


def replace_panel_pattern(text: str, pattern: str) -> str:
    """Replace a bg pattern with glass panel, preserving other utilities."""

    def repl(m):
        before = m.group(1)
        rest = m.group(2)
        cleaned = strip_glass_redundant_classes(rest)
        parts = [GLASS_PANEL]
        if cleaned:
            parts.append(cleaned)
        return f'{before}{" ".join(parts)}"'

    return re.sub(pattern, repl, text)


def migrate_content(content: str, filename: str) -> str:
    # ── Main panel: bg-gray-800/XX backdrop-blur ... rounded-xl border border-gray-700 ──
    content = replace_panel_pattern(
        content,
        r'(className=")bg-gray-800/\d+\s+backdrop-blur(?:-sm|-md)?\s+rounded-xl\s+border\s+border-gray-700(?:/\d+)?([^"]*)"',
    )
    content = replace_panel_pattern(
        content,
        r'(className=")bg-gray-800/\d+\s+backdrop-blur(?:-sm|-md)?\s+rounded-xl\s+border\s+border-gray-700([^"]*)"',
    )

    # bg-gray-800/50 border border-gray-700 rounded-lg (filter bars → chip)
    def filter_bar_repl(m):
        rest = m.group(1)
        cleaned = strip_glass_redundant_classes(rest)
        parts = [GLASS_CHIP]
        if cleaned:
            parts.append(cleaned)
        return f'className="{" ".join(parts)}"'

    content = re.sub(
        r'className="bg-gray-800/\d+\s+border\s+border-gray-700\s+rounded-lg([^"]*)"',
        filter_bar_repl,
        content,
    )

    # bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700 (without /opacity on border)
    content = replace_panel_pattern(
        content,
        r'(className=")bg-gray-800/\d+\s+backdrop-blur-sm\s+rounded-xl\s+border\s+border-gray-700([^"]*)"',
    )

    # Modal / card: bg-gray-800 rounded-xl ... border border-gray-700
    content = replace_panel_pattern(
        content,
        r'(className=")bg-gray-800\s+rounded-xl([^"]*?)border\s+border-gray-700([^"]*)"',
    )
    content = replace_panel_pattern(
        content,
        r'(className=")bg-gray-900\s+rounded-xl([^"]*?)border\s+border-gray-700([^"]*)"',
    )

    # bg-gray-900/50 rounded-lg overflow-hidden border border-gray-700
    content = replace_panel_pattern(
        content,
        r'(className=")bg-gray-900/\d+\s+rounded-lg\s+overflow-hidden\s+border\s+border-gray-700([^"]*)"',
    )

    # Section cards: bg-gray-800/40 border border-gray-700/60 rounded-xl
    content = replace_panel_pattern(
        content,
        r'(className=")bg-gray-800/\d+\s+border\s+border-gray-700/\d+\s+rounded-xl([^"]*)"',
    )
    content = replace_panel_pattern(
        content,
        r'(className=")bg-gray-800/\d+\s+border\s+border-gray-700/\d+\s+rounded-xl([^"]*)"',
    )

    # space-y-4 bg-gray-800/40 border ... (AntiCheatSettings)
    content = replace_panel_pattern(
        content,
        r'(className=")space-y-4\s+bg-gray-800/\d+\s+border\s+border-gray-700/\d+\s+rounded-xl([^"]*)"',
    )

    # Table outer wrapper
    content = re.sub(
        r'className="overflow-x-auto rounded-xl border border-gray-700/\d+"',
        f'className="{GLASS_PANEL} overflow-x-auto"',
        content,
    )
    content = re.sub(
        r'className="overflow-x-auto rounded-xl border border-gray-700"',
        f'className="{GLASS_PANEL} overflow-x-auto"',
        content,
    )

    # bg-gray-800/30 rounded-lg p-4 info boxes → chip
    content = re.sub(
        r'className="bg-gray-800/30 rounded-lg p-4([^"]*)"',
        lambda m: f'className="{GLASS_CHIP} p-4{m.group(1)}"',
        content,
    )
    content = re.sub(
        r'className="mt-6 bg-gray-800/30 rounded-lg p-4([^"]*)"',
        lambda m: f'className="mt-6 {GLASS_CHIP} p-4{m.group(1)}"',
        content,
    )

    # thead softening
    content = re.sub(
        r'\bbg-gray-800/80\b',
        "bg-white/5",
        content,
    )
    content = re.sub(
        r'\bbg-gray-800/50\b(?=\s*")',  # thead only at end of className
        "bg-white/5",
        content,
    )
    content = content.replace('thead className="bg-gray-800/50"', 'thead className="bg-white/5"')

    # Sticky modal headers/footers: bg-gray-800 → transparent/glass-friendly
    content = re.sub(
        r'sticky top-0 bg-gray-800 border-b border-gray-700',
        "sticky top-0 bg-white/5 border-b border-white/10",
        content,
    )
    content = re.sub(
        r'sticky bottom-0 bg-gray-800 border-t border-gray-700',
        "sticky bottom-0 bg-white/5 border-t border-white/10",
        content,
    )
    content = re.sub(
        r'sticky top-0 bg-gray-900 border-b border-gray-700',
        "sticky top-0 bg-white/5 border-b border-white/10",
        content,
    )
    content = re.sub(
        r'sticky bottom-0 bg-gray-900 border-t border-gray-700',
        "sticky bottom-0 bg-white/5 border-t border-white/10",
        content,
    )

    # Modal header bg-gray-800 px-6
    content = re.sub(
        r'sticky top-0 bg-gray-800 px-6',
        "sticky top-0 bg-white/5 px-6",
        content,
    )

    # Section header bars bg-gray-900/50 px-4 py-3 border-b
    content = re.sub(
        r'bg-gray-900/50 px-4 py-3 border-b border-gray-700',
        "bg-white/5 px-4 py-3 border-b border-white/10",
        content,
    )

    # List item rows in panels → chip
    content = re.sub(
        r'className="group bg-gray-700/30 hover:bg-gray-700/50 rounded-lg p-4 border border-gray-600/30 hover:border-orange-500/50 transition-all cursor-pointer"',
        f'className="group {GLASS_CHIP} p-4 hover:border-orange-500/50 transition-all cursor-pointer"',
        content,
    )

    # Mini stat cards in AdminHome (gradient stat cards)
    content = re.sub(
        r'className="group flex-1 bg-gradient-to-br from-gray-700/40 to-gray-800/40 hover:from-gray-700/60 hover:to-gray-800/60 backdrop-blur-sm rounded-lg p-4 cursor-pointer border border-gray-600/30 hover:border-gray-500/50 transition-all min-w-0"',
        f'className="group flex-1 {GLASS_CHIP} p-4 cursor-pointer hover:border-white/20 transition-all min-w-0"',
        content,
    )

    # Quick action / doc link buttons in AdminHome
    content = re.sub(
        r'className="group flex flex-col items-center gap-3 p-5 bg-gray-700/30 hover:bg-gray-700/50 rounded-xl transition-all border border-gray-600/30 hover:border-(\w+)-500/50"',
        r'className="group flex flex-col items-center gap-3 p-5 student-glass-chip transition-all hover:border-\1-500/50"',
        content,
    )

    # Duty status bar
    content = re.sub(
        r'className="flex items-center gap-2 bg-gray-800/60 border border-gray-700/50 rounded-xl px-4 py-2\.5"',
        f'className="flex items-center gap-2 {GLASS_CHIP} px-4 py-2.5"',
        content,
    )

    # Exam candidate section outer - keep yellow tint but add glass
    content = re.sub(
        r'className="bg-gradient-to-r from-yellow-900/30 to-orange-900/30 backdrop-blur-sm rounded-xl p-6 border border-yellow-700/50"',
        f'className="{GLASS_PANEL} student-glass-chip--yellow p-6"',
        content,
    )

    # Exam candidate cards
    content = re.sub(
        r'className="group bg-yellow-900/20 hover:bg-yellow-900/30 rounded-lg p-4 border border-yellow-700/30 hover:border-yellow-500/50 transition-all cursor-pointer"',
        f'className="group {GLASS_CHIP} student-glass-chip--yellow p-4 hover:border-yellow-500/50 transition-all cursor-pointer"',
        content,
    )

    # Leave end alert - glass with yellow tint
    content = re.sub(
        r'className="bg-orange-900/90 backdrop-blur-md border border-orange-500/50 rounded-xl p-4 shadow-2xl shadow-orange-900/30"',
        f'className="{GLASS_PANEL} student-glass-chip--yellow p-4 shadow-2xl shadow-orange-900/30 border-orange-500/50"',
        content,
    )

    # DocManagement sidebar
    content = re.sub(
        r'className="w-64 flex-shrink-0 bg-gray-800/60 border-r border-gray-700 flex flex-col"',
        f'className="w-64 flex-shrink-0 {GLASS_PANEL} border-r border-white/10 flex flex-col"',
        content,
    )
    content = re.sub(
        r'className="flex items-center justify-between px-6 py-3 border-b border-gray-700 bg-gray-800/30 flex-shrink-0"',
        f'className="flex items-center justify-between px-6 py-3 border-b border-white/10 bg-white/5 flex-shrink-0"',
        content,
    )

    # Progress assignment list items
    content = re.sub(
        r'className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg hover:bg-gray-800/70 transition-colors"',
        f'className="flex items-center justify-between p-3 {GLASS_CHIP} transition-colors"',
        content,
    )

    # PublicVideosManagement modal sticky header
    content = re.sub(
        r'sticky top-0 bg-gray-800 px-6 py-4 border-b border-gray-700',
        "sticky top-0 bg-white/5 px-6 py-4 border-b border-white/10",
        content,
    )

    # AntiCheatSessionDetail: use panel without heavy inner blur on evidence
    if "AntiCheatSessionDetail" in filename:
        # Screenshot/evidence containers - use minimal border, no glass blur
        content = re.sub(
            r'className="([^"]*?)backdrop-blur(?:-sm|-md)?([^"]*screenshot[^"]*)"',
            lambda m: f'className="{m.group(1).strip()} {m.group(2).strip()}"'.replace("  ", " "),
            content,
            flags=re.IGNORECASE,
        )

    return content


def second_pass(content: str, filename: str) -> str:
    """Additional targeted replacements."""
    subs = [
        # Loading spinners / simple modals without border
        ('className="bg-gray-800 rounded-xl p-8"', f'className="{GLASS_PANEL} p-8"'),
        # PublicVideos modal
        ('className="bg-gray-800 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"',
         f'className="{GLASS_PANEL} max-w-2xl w-full max-h-[90vh] overflow-y-auto"'),
        # Tab bars
        ('className="flex gap-1 bg-gray-800/50 rounded-lg p-1 w-fit"',
         f'className="flex gap-1 {GLASS_CHIP} p-1 w-fit"'),
        ('className="flex gap-1 bg-gray-800/50 rounded-lg p-1"',
         f'className="flex gap-1 {GLASS_CHIP} p-1"'),
        # ReminderList table shell
        ('className="bg-gray-800/40 border border-gray-700 rounded-xl overflow-hidden"',
         f'className="{GLASS_PANEL} overflow-hidden"'),
        # AntiCheat filter bar
        ('className="flex flex-wrap items-center gap-3 bg-gray-800/40 border border-gray-700/50 rounded-xl p-4"',
         f'className="flex flex-wrap items-center gap-3 {GLASS_CHIP} p-4"'),
        ('className="flex flex-wrap items-center justify-between gap-2 bg-gray-800/40 border border-gray-700/50 rounded-xl px-3 py-2.5"',
         f'className="flex flex-wrap items-center justify-between gap-2 {GLASS_CHIP} px-3 py-2.5"'),
        # AssessmentRecords sections
        ('className="min-h-0 flex flex-col overflow-hidden bg-gray-800/40 border border-gray-700/60 rounded-xl p-4 sm:p-5"',
         f'className="min-h-0 flex flex-col overflow-hidden {GLASS_PANEL} p-4 sm:p-5"'),
        ('className="shrink-0 border-b border-gray-700/80 bg-gray-900/95 backdrop-blur-sm px-6 py-4 flex items-center justify-between"',
         'className="shrink-0 border-b border-white/10 bg-white/5 px-6 py-4 flex items-center justify-between"'),
        ('className="shrink-0 border-t border-gray-700/80 bg-gray-900/95 backdrop-blur-sm px-6 py-4 flex gap-3 justify-end"',
         'className="shrink-0 border-t border-white/10 bg-white/5 px-6 py-4 flex gap-3 justify-end"'),
        # AssessmentApproval modal inner chips
        ('className="flex items-center gap-2 text-sm text-white bg-gray-800/50 rounded px-3 py-2"',
         f'className="flex items-center gap-2 text-sm text-white {GLASS_CHIP} px-3 py-2"'),
        # LeaveRecords info box
        ('className="bg-gray-900/50 border border-gray-700 rounded-lg p-3"',
         f'className="{GLASS_CHIP} p-3"'),
        # ReminderList dropdown
        ('className="absolute right-0 top-full mt-1.5 z-40 w-56 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 overflow-hidden"',
         f'className="absolute right-0 top-full mt-1.5 z-40 w-56 {GLASS_PANEL} shadow-xl py-1 overflow-hidden"'),
        # ReminderList stat boxes
        ('className="bg-gray-900/50 border border-gray-700 rounded-lg px-3 py-2"',
         f'className="{GLASS_CHIP} px-3 py-2"'),
        # MemberDetail action buttons
        ('className="flex items-center justify-center space-x-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-colors"',
         'className="flex items-center justify-center space-x-2 px-4 py-2 student-glass-chip transition-colors"'),
        # SurveyResults - main sections
        ('className="rounded-2xl border border-gray-700/60 bg-gray-800/40 p-5 space-y-4"',
         f'className="{GLASS_PANEL} p-5 space-y-4"'),
        ('className="rounded-2xl border border-gray-700/60 bg-gray-800/30 overflow-hidden"',
         f'className="{GLASS_PANEL} overflow-hidden"'),
        ('className={`rounded-xl border border-gray-700/50 bg-gray-900/40 p-4 ${',
         'className={`student-glass-panel student-glass-panel--static p-4 ${'),
        ('className={`rounded-xl border border-gray-700/40 bg-gray-900/40 p-3 ${',
         'className={`student-glass-chip p-3 ${'),
        ('className="rounded-lg border border-gray-700/40 bg-gray-950/50 px-3 py-2 text-sm text-gray-100 whitespace-pre-wrap break-words"',
         f'className="{GLASS_CHIP} px-3 py-2 text-sm text-gray-100 whitespace-pre-wrap break-words"'),
        ('className="px-2.5 py-1 rounded-lg bg-gray-800 text-gray-300 hover:text-white border border-gray-700"',
         'className="px-2.5 py-1 rounded-lg student-glass-chip text-gray-300 hover:text-white"'),
        ('className="px-2.5 py-1.5 rounded-lg bg-gray-800 text-gray-300 hover:text-white border border-gray-700"',
         'className="px-2.5 py-1.5 rounded-lg student-glass-chip text-gray-300 hover:text-white"'),
        ('className="flex flex-wrap items-center gap-2 px-2 py-2 bg-gray-900/50 border-b border-gray-700/50"',
         'className="flex flex-wrap items-center gap-2 px-2 py-2 bg-white/5 border-b border-white/10"'),
        ('className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-gray-900/50 hover:bg-gray-900/70 text-left transition-colors"',
         'className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-white/5 hover:bg-white/10 text-left transition-colors"'),
        # AntiCheat table wrappers (not screenshot cards)
        ('className="overflow-x-auto rounded-xl border border-gray-700/50 max-h-[60vh]"',
         f'className="{GLASS_PANEL} overflow-x-auto max-h-[60vh]"'),
        ('className="overflow-x-auto rounded-xl border border-gray-700/50 max-h-[40vh]"',
         f'className="{GLASS_PANEL} overflow-x-auto max-h-[40vh]"'),
        ('className="overflow-x-auto rounded-xl border border-gray-700/50 max-h-[30vh]"',
         f'className="{GLASS_PANEL} overflow-x-auto max-h-[30vh]"'),
        ('className={`overflow-x-auto rounded-xl border border-gray-700/50 ${',
         'className={`student-glass-panel student-glass-panel--static overflow-x-auto ${'),
        # AntiCheat sticky table headers
        ('className="sticky top-0 z-10 px-3 py-2 bg-gray-800 border-b border-gray-700/50 flex items-center justify-between"',
         'className="sticky top-0 z-10 px-3 py-2 bg-white/5 border-b border-white/10 flex items-center justify-between"'),
        ('className="sticky top-0 z-10 px-3 py-2 bg-gray-800 border-b border-gray-700/50"',
         'className="sticky top-0 z-10 px-3 py-2 bg-white/5 border-b border-white/10"'),
        ('<thead className="bg-gray-800 sticky top-0 text-gray-300">',
         '<thead className="bg-white/5 sticky top-0 text-gray-300">'),
        ('<thead className="bg-gray-800 text-gray-300">',
         '<thead className="bg-white/5 text-gray-300">'),
        # AntiCheat info card
        ('className="bg-gray-900/50 rounded-lg p-3 border border-gray-700/40"',
         f'className="{GLASS_CHIP} p-3"'),
        # VideoUpload inner bars
        ('className="p-4 border-b border-gray-700 flex items-center justify-between"',
         'className="p-4 border-b border-white/10 flex items-center justify-between"'),
        ('className="px-4 py-2 bg-gray-900/30 border-b border-gray-700 flex items-center gap-2 text-sm"',
         'className="px-4 py-2 bg-white/5 border-b border-white/10 flex items-center gap-2 text-sm"'),
        ('className="p-4 border-t border-gray-700 flex items-center justify-center gap-2"',
         'className="p-4 border-t border-white/10 flex items-center justify-center gap-2"'),
        # DocManagement inner
        ('className="p-3 border-b border-gray-700 flex items-center justify-between"',
         'className="p-3 border-b border-white/10 flex items-center justify-between"'),
        ('className="border-t border-gray-700 bg-gray-900/60 flex-shrink-0"',
         'className="border-t border-white/10 bg-white/5 flex-shrink-0"'),
        # Assessment modal borders
        ('className="border-b border-gray-700 px-6 py-4"',
         'className="border-b border-white/10 px-6 py-4"'),
        ('className="border-t border-gray-700 px-6 py-4 flex gap-3 justify-end"',
         'className="border-t border-white/10 px-6 py-4 flex gap-3 justify-end"'),
        ('className="border-t border-gray-700 px-6 py-4 flex justify-end"',
         'className="border-t border-white/10 px-6 py-4 flex justify-end"'),
        # PublicVideos modal borders
        ('className="sticky top-0 bg-white/5 px-6 py-4 border-b border-gray-700 flex items-center justify-between"',
         'className="sticky top-0 bg-white/5 px-6 py-4 border-b border-white/10 flex items-center justify-between"'),
        ('className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3"',
         'className="px-6 py-4 border-t border-white/10 flex justify-end gap-3"'),
        # CourseManagement modal borders
        ('className="px-6 py-4 border-b border-gray-700"',
         'className="px-6 py-4 border-b border-white/10"'),
        ('className="px-6 py-4 border-t border-gray-700 flex gap-3"',
         'className="px-6 py-4 border-t border-white/10 flex gap-3"'),
    ]
    for old, new in subs:
        content = content.replace(old, new)

    # AntiCheatSessionDetail: screenshot cards - plain border, no glass blur
    if "AntiCheatSessionDetail" in filename:
        content = content.replace(
            'className={`rounded-xl border overflow-hidden bg-gray-800/40 group ${',
            'className={`rounded-xl border overflow-hidden bg-gray-900/80 group ${',
        )

    return content


def migrate_file(path: Path) -> bool:
    original = path.read_text(encoding="utf-8")
    content = original

    # SurveyManagement: skip editor block (survey-editor-light)
    if path.name == "SurveyManagement.tsx":
        editor_start = content.find('className="survey-editor-light')
        list_start = content.find("// ─── 列表页 ───")
        if editor_start != -1 and list_start != -1:
            before = content[:editor_start]
            editor_and_middle = content[editor_start:list_start]
            after = content[list_start:]
            before = migrate_content(before, path.name)
            after = migrate_content(after, path.name)
            content = before + editor_and_middle + after
        else:
            content = migrate_content(content, path.name)
    else:
        content = migrate_content(content, path.name)

    content = second_pass(content, path.name)

    # Second pass: catch remaining common panel patterns
    patterns_second = [
        (
            r'className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700"',
            f'className="{GLASS_PANEL} p-6"',
        ),
        (
            r'className="lg:col-span-2 bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700"',
            f'className="lg:col-span-2 {GLASS_PANEL} p-6"',
        ),
        (
            r'className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700 overflow-hidden"',
            f'className="{GLASS_PANEL} overflow-hidden"',
        ),
        (
            r'className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700 p-4 mb-4"',
            f'className="{GLASS_CHIP} p-4 mb-4"',
        ),
        (
            r'className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700 p-4 mb-4"',
            f'className="{GLASS_CHIP} p-4 mb-4"',
        ),
    ]
    for old, new in patterns_second:
        content = content.replace(old, new)

    if content != original:
        path.write_text(content, encoding="utf-8")
        return True
    return False


def main():
    changed = []
    for path in sorted(ADMIN.rglob("*.tsx")):
        if migrate_file(path):
            changed.append(str(path.relative_to(ROOT)))
    print(f"Changed {len(changed)} files:")
    for f in changed:
        print(f"  - {f}")


if __name__ == "__main__":
    main()
