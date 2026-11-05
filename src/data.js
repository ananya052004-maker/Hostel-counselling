export const officialImages = [
  'https://vit.ac.in/wp-content/uploads/2025/03/327A0201-copy-1024x683.webp',
  'https://vit.ac.in/wp-content/uploads/2025/03/IMG_0039-copy-1024x576.webp',
  'https://vit.ac.in/wp-content/uploads/2025/03/IMG_0041-copy-1024x576.webp',
  'https://vit.ac.in/wp-content/uploads/2025/03/IMG_0059-copy-1024x576.webp',
  'https://vit.ac.in/wp-content/uploads/2025/03/IMG_0096-copy-1024x576.webp',
  'https://vit.ac.in/wp-content/uploads/2025/03/IMG_0100-copy-1024x576.webp',
  'https://vit.ac.in/wp-content/uploads/2025/03/IMG_0108-copy-1024x576.webp',
  'https://vit.ac.in/wp-content/uploads/2025/03/IMG_0130-copy-1024x576.webp',
  'https://vit.ac.in/wp-content/uploads/2025/03/IMG_0067-copy-scaled.webp',
  'https://vit.ac.in/wp-content/uploads/2025/03/327A9969-copy-scaled.webp'
];

export const officialBlocks = [
  ['MH A', 'Albert Einstein', 'mens', '0416 220 2531'], ['MH B', 'Swami Vivekananda', 'mens', '0416 220 2532'], ['MH B Annex', 'Swami Vivekananda – B Annex', 'mens', '0416 220 2533'], ['MH C', 'Rabindranath Tagore', 'mens', '0416 220 2534'], ['MH D', 'Nelson Mandela', 'mens', '0416 220 2535'], ['MH D Annex', 'Nelson Mandela – D Annex', 'mens', '0416 220 2536'], ['MH E', 'Sir C.V. Raman', 'mens', '0416 220 2537'], ['MH F', 'Ramanujam', 'mens', '0416 220 2538'], ['MH G', 'Socrates', 'mens', '0416 220 2539'], ['MH H', 'John F Kennedy', 'mens', '0416 220 2540'], ['MH J', 'John F Kennedy', 'mens', '0416 220 2541'], ['MH K', 'Dr. Sarvepalli Radhakrishnan', 'mens', '0416 220 2542'], ['MH L', 'Netaji Subhas Chandra Bose', 'mens', '0416 220 2543'], ['MH M', 'Quaid-e-Millat Muhammed Ismail', 'mens', '0416 220 2544'], ['MH M Annex', 'Quaid-e-Millat Muhammed Ismail – M Annex', 'mens', '0416 220 2545'], ['MH N', 'Charles Darwin', 'mens', '0416 220 2546'], ['MH N Annex', 'Charles Darwin – N Annex', 'mens', '0416 220 2564'], ['MH P', 'Sardar Patel', 'mens', '0416 220 2547'], ['MH Q', 'Vajpayee Block', 'mens', '0416 220 2548'], ['MH R', 'Muthamizh Arignar Kalaignar M. Karunanidhi', 'mens', '0416 220 2549'], ['MH S', 'Abdul Kalam Block', 'mens', '0416 220 2550'], ['MH T', 'Jagadish Chandra Bose Block', 'mens', '0416 220 2551'],
  ['LH A', 'Ladies Hostel A', 'ladies', '0416 220 2669'], ['LH B', 'Ladies Hostel B', 'ladies', '0416 220 2670'], ['LH C', 'Ladies Hostel C', 'ladies', '0416 220 2703'], ['LH D', 'Ladies Hostel D', 'ladies', '0416 220 2704'], ['LH E', 'Ladies Hostel E', 'ladies', '0416 220 2705'], ['LH F', 'Ladies Hostel F', 'ladies', '0416 220 2706'], ['LH G', 'Ladies Hostel G', 'ladies', '0416 220 2892'], ['LH H', 'Ladies Hostel H', 'ladies', '0416 220 2894'], ['LH J', 'Ladies Hostel J', 'ladies', '0416 220 2896'], ['RGT H', 'RGT H Ladies Hostel', 'ladies', '0416 220 5003'], ['LH GH Annex', 'Ladies Hostel GH Annex', 'ladies', '0416 220 2244']
];

export function getSeedHostels() {
  const hostels = officialBlocks.map(([code, name, gender, phone], index) => ({
    code, name, gender, type: 'Hostel', phone, beds: '1 / 2 / 3 / 4 bed',
    roomTypes: ['1', '2', '3', '4'], tags: ['AC', 'Non-AC'],
    mess: 'Assigned by hostel', rating: '—', image: officialImages[index % officialImages.length],
    roomCounts: { single: 28 + (index % 4) * 6, double: 96 + (index % 5) * 12, triple: 168 + (index % 4) * 18, four: 72 + (index % 3) * 12 },
    description: `${code} · Official VIT Vellore hostel block. Room occupancy and AC category are allotted during counselling.`
  }));
  const apartments = [
    ['MA G', "Men's Apartment G", 'mens'],
    ['MA H', "Men's Apartment H", 'mens'],
    ['MA J', "Men's Apartment J", 'mens'],
    ['WA G', "Women's Apartment G", 'ladies'],
    ['WA H', "Women's Apartment H", 'ladies'],
    ['WA J', "Women's Apartment J", 'ladies']
  ].map(([code, name, gender], index) => ({
    code, name, gender, type: 'Apartment', phone: 'Verify on VTOP',
    beds: '3 / 4 / 6 bed', roomTypes: ['3', '4', '6'], tags: ['AC'],
    mess: 'Apartment mess / assigned mess', rating: '—',
    image: officialImages[(index + 3) % officialImages.length],
    roomCounts: { single: 0, double: 0, triple: 24 + index * 6, four: 36 + index * 6, six: 48 + index * 6 },
    description: `${code} · Apartment-style accommodation listing. Confirm the current block name, room inventory, and allotment rules in VTOP.`
  }));
  return [...hostels, ...apartments];
}
