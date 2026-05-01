/**
 * Get the file name from a file path
 * Works on both Windows and macOS
 */
export function getFileName(filePath: string): string {
  if (!filePath) return '';
  // Handle both Windows (\) and macOS (/) path separators
  const parts = filePath.split(/[/\\]/);
  return parts.pop() || '';
}

/**
 * Get the file name without extension
 */
export function getFileNameWithoutExtension(filePath: string): string {
  const fileName = getFileName(filePath);
  return fileName.replace(/\.[^/.]+$/, '') || '';
}

/**
 * Get the directory path
 */
export function getDirectoryPath(filePath: string): string {
  if (!filePath) return '';
  // Handle both Windows (\) and macOS (/) path separators
  const parts = filePath.split(/[/\\]/);
  parts.pop();
  return parts.join('/') || '/';
}

/**
 * Check if the path is a Windows path
 */
export function isWindowsPath(path: string): boolean {
  return /^[A-Z]:\\/i.test(path);
}

/**
 * Normalize path separators to forward slash
 */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}
