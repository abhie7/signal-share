export function extractSubnet(ip: string): string {
  // Handle IPv6-mapped IPv4 addresses (e.g., ::ffff:192.168.1.100)
  const cleanIp = ip.replace(/^::ffff:/, '');

  // Handle IPv4
  if (cleanIp.includes('.')) {
    const parts = cleanIp.split('.');
    return parts.slice(0, 3).join('.') + '.0/24';
  }

  // Handle IPv6 — use first 4 segments as subnet
  const parts = cleanIp.split(':');
  return parts.slice(0, 4).join(':') + '::/64';
}

export function isPrivateIP(ip: string): boolean {
  const cleanIp = ip.replace(/^::ffff:/, '');

  if (cleanIp.includes('.')) {
    const parts = cleanIp.split('.').map(Number);
    // 10.0.0.0/8
    if (parts[0] === 10) return true;
    // 172.16.0.0/12
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.168.0.0/16
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 127.0.0.0/8 (loopback)
    if (parts[0] === 127) return true;
    return false;
  }

  // IPv6 loopback
  if (cleanIp === '::1') return true;
  // IPv6 link-local
  if (cleanIp.startsWith('fe80:')) return true;
  // IPv6 unique local
  if (cleanIp.startsWith('fc') || cleanIp.startsWith('fd')) return true;

  return false;
}

export function getClientIP(request: { ip?: string; headers: Record<string, string | string[] | undefined> }): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (forwarded) {
    const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return ip.trim();
  }
  return request.ip || '127.0.0.1';
}
