import fs from 'fs';
import path from 'path';

const assetsDir = path.join(process.cwd(), 'client', 'public', 'assets');

if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
}

const assets = {
    'ground.svg': `
<svg width="128" height="128" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
    <rect width="128" height="128" fill="#1a1a1a" />
    <path d="M0 0h128v128H0z" fill="none" stroke="#333" stroke-width="2" />
    <circle cx="64" cy="64" r="2" fill="#444" />
    <path d="M0 64h128M64 0v128" stroke="#222" stroke-width="1" />
    <rect x="10" y="10" width="4" height="4" fill="#2a2a2a" />
    <rect x="110" y="110" width="4" height="4" fill="#2a2a2a" />
    <rect x="110" y="10" width="4" height="4" fill="#2a2a2a" />
    <rect x="10" y="110" width="4" height="4" fill="#2a2a2a" />
</svg>`,
    'player.svg': `
<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <!-- Shadow -->
    <ellipse cx="32" cy="40" rx="20" ry="8" fill="rgba(0,0,0,0.3)" />
    <!-- Body -->
    <circle cx="32" cy="32" r="20" fill="#3b82f6" stroke="#1e3a8a" stroke-width="3" />
    <!-- Head/Helmet -->
    <circle cx="32" cy="32" r="12" fill="#1e40af" stroke="#1d4ed8" stroke-width="2" />
    <!-- Visor (Facing direction is Up by default in our SVG, but we can make it Point Right for 0 rotation) -->
    <!-- Let's assume 0 rotation = Facing Right -->
    <rect x="36" y="28" width="12" height="8" rx="2" fill="#60a5fa" />
    <!-- Backpack -->
    <rect x="14" y="24" width="8" height="16" rx="2" fill="#1d4ed8" />
</svg>`,
    'monster.svg': `
<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="32" cy="36" rx="18" ry="12" fill="rgba(0,0,0,0.3)" />
    <path d="M12 32 L32 12 L52 32 L32 52 Z" fill="#f97316" stroke="#7c2d12" stroke-width="3" />
    <circle cx="26" cy="28" r="3" fill="#fff" />
    <circle cx="38" cy="28" r="3" fill="#fff" />
    <path d="M20 40 Q32 48 44 40" fill="none" stroke="#7c2d12" stroke-width="2" />
</svg>`,
    'elite.svg': `
<svg width="80" height="80" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="40" cy="45" rx="30" ry="15" fill="rgba(0,0,0,0.4)" />
    <rect x="20" y="20" width="40" height="40" rx="8" fill="#dc2626" stroke="#450a0a" stroke-width="4" />
    <path d="M20 20 L10 10 M60 20 L70 10" stroke="#450a0a" stroke-width="5" stroke-linecap="round" />
    <circle cx="32" cy="35" r="5" fill="#fef08a" />
    <circle cx="48" cy="35" r="5" fill="#fef08a" />
    <path d="M25 50 H55" stroke="#450a0a" stroke-width="3" />
</svg>`,
    'crate.svg': `
<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <rect x="8" y="8" width="48" height="48" rx="4" fill="#92400e" stroke="#451a03" stroke-width="3" />
    <path d="M8 8 L56 56 M56 8 L8 56" stroke="#451a03" stroke-width="2" />
    <rect x="20" y="20" width="24" height="24" fill="#b45309" stroke="#451a03" stroke-width="1" />
</svg>`,
    'rock.svg': `
<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <path d="M32 8 L56 32 L48 56 L16 56 L8 32 Z" fill="#475569" stroke="#1e293b" stroke-width="3" />
    <path d="M32 8 L32 32 L56 32 M32 32 L48 56" stroke="#1e293b" stroke-width="1" opacity="0.5" />
</svg>`,
    'brush.svg': `
<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="32" r="24" fill="#166534" stroke="#064e3b" stroke-width="2" />
    <circle cx="20" cy="20" r="10" fill="#15803d" />
    <circle cx="44" cy="24" r="8" fill="#15803d" />
    <circle cx="32" cy="44" r="12" fill="#15803d" />
</svg>`,
    'beacon.svg': `
<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <rect x="28" y="20" width="8" height="40" fill="#475569" />
    <circle cx="32" cy="16" r="12" fill="#0ea5e9" stroke="#e0f2fe" stroke-width="2" />
    <path d="M32 4 L32 10 M44 16 L50 16 M32 28 L32 34 M20 16 L14 16" stroke="#e0f2fe" stroke-width="2" stroke-linecap="round" />
</svg>`,
    'drop.svg': `
<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
    <circle cx="16" cy="16" r="10" fill="#facc15" stroke="#a16207" stroke-width="2" />
    <path d="M16 10 L19 16 L16 22 L13 16 Z" fill="#fff" />
</svg>`
};

for (const [name, content] of Object.entries(assets)) {
    fs.writeFileSync(path.join(assetsDir, name), content.trim());
    console.log(`Generated ${name}`);
}
