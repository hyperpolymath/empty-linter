{
  linter = {
    target_dir = ".",
    overlay_color = "magenta",
    auto_fix = true,
    exclude_paths = ["node_modules", ".git", "lib"],
    artifacts = [
      { name = "NBSP", hex = "0xA0", pattern = "\u00A0" },
      { name = "ZWSP", hex = "0x200B", pattern = "\u200B" },
      { name = "BOM", hex = "0xFEFF", pattern = "\uFEFF" },
    ],
  }
}
