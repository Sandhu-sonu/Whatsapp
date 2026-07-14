import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const districtsData = [
  { name: 'Amritsar', code: 'AM' },
  { name: 'Barnala', code: 'BN' },
  { name: 'Bathinda', code: 'BT' },
  { name: 'Faridkot', code: 'FR' },
  { name: 'Fatehgarh Sahib', code: 'FT' },
  { name: 'Fazilka', code: 'FZ' },
  { name: 'Ferozepur', code: 'FI' },
  { name: 'Gurdaspur', code: 'GD' },
  { name: 'Hoshiarpur', code: 'HO' },
  { name: 'Jalandhar', code: 'JA' },
  { name: 'Kapurthala', code: 'KA' },
  { name: 'Ludhiana', code: 'LD' },
  { name: 'Malerkotla', code: 'MC' },
  { name: 'Mansa', code: 'MA' },
  { name: 'Moga', code: 'MO' },
  { name: 'Pathankot', code: 'PA' },
  { name: 'Patiala', code: 'PL' },
  { name: 'Rupnagar', code: 'RU' },
  { name: 'S.A.S. Nagar', code: 'SAS' },
  { name: 'Sangrur', code: 'SA' },
  { name: 'Shahid Bhagat Singh Nagar', code: 'SBS' },
  { name: 'Sri Muktsar Sahib', code: 'MU' },
  { name: 'Tarn Taran', code: 'TT' },
];

const settingsData = [
  { key: 'Group Name', value: 'DSD Monitoring' },
  { key: 'Cutoff Time', value: '17:00' },
  { key: 'Polling Interval', value: '20' },
  { key: 'Theme', value: 'dark' },
];

async function main() {
  console.log('Seeding database...');

  // 1. Seed Districts
  for (const d of districtsData) {
    await prisma.district.upsert({
      where: { name: d.name },
      update: {},
      create: {
        name: d.name,
        code: d.code,
        isActive: true,
      },
    });
  }
  console.log(`Successfully seeded ${districtsData.length} districts.`);

  // 1.5 Seed District Aliases
  const aliasesData = [
    { alias: 'mohali', districtName: 'S.A.S. Nagar' },
    { alias: 'sas nagar', districtName: 'S.A.S. Nagar' },
    { alias: 's.a.s nagar', districtName: 'S.A.S. Nagar' },
    { alias: 'ropar', districtName: 'Rupnagar' },
    { alias: 'nawanshahr', districtName: 'Shahid Bhagat Singh Nagar' },
    { alias: 'sbs nagar', districtName: 'Shahid Bhagat Singh Nagar' },
    { alias: 'muktsar', districtName: 'Sri Muktsar Sahib' },
    { alias: 'tarn taran sahib', districtName: 'Tarn Taran' },
  ];

  for (const a of aliasesData) {
    const dist = await prisma.district.findUnique({ where: { name: a.districtName } });
    if (dist) {
      await prisma.districtAlias.upsert({
        where: { alias: a.alias },
        update: {},
        create: {
          alias: a.alias,
          districtId: dist.id,
        },
      });
    }
  }
  console.log(`Successfully seeded ${aliasesData.length} district aliases.`);

  // 2. Seed Settings
  for (const s of settingsData) {
    await prisma.setting.upsert({
      where: { key: s.key },
      update: { value: s.value },
      create: {
        key: s.key,
        value: s.value,
      },
    });
  }
  console.log('Successfully seeded default settings.');
  console.log('Seeding completed!');
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
