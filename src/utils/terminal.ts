export function colorize(message: string, color: 'cyan' | 'green'): string {
  const colors = { cyan: '36', green: '32' }
  return `\r\n\x1b[${colors[color]}m${message}\x1b[0m\r\n`
}
