const FLAGS: Record<string, string> = {
  "יפן": "🇯🇵", japan: "🇯🇵",
  "תאילנד": "🇹🇭", thailand: "🇹🇭",
  "איטליה": "🇮🇹", italy: "🇮🇹",
  "צרפת": "🇫🇷", france: "🇫🇷",
  "ספרד": "🇪🇸", spain: "🇪🇸",
  "יוון": "🇬🇷", greece: "🇬🇷",
  "פורטוגל": "🇵🇹", portugal: "🇵🇹",
  "גרמניה": "🇩🇪", germany: "🇩🇪",
  "הולנד": "🇳🇱", netherlands: "🇳🇱",
  "אנגליה": "🇬🇧", "בריטניה": "🇬🇧", "united kingdom": "🇬🇧", uk: "🇬🇧",
  "ארה\"ב": "🇺🇸", "ארהב": "🇺🇸", usa: "🇺🇸", "united states": "🇺🇸",
  "טורקיה": "🇹🇷", turkey: "🇹🇷",
  "קרואטיה": "🇭🇷", croatia: "🇭🇷",
  "גאורגיה": "🇬🇪", georgia: "🇬🇪",
  "מרוקו": "🇲🇦", morocco: "🇲🇦",
  "מצרים": "🇪🇬", egypt: "🇪🇬",
  "ירדן": "🇯🇴", jordan: "🇯🇴",
  "הודו": "🇮🇳", india: "🇮🇳",
  "וייטנאם": "🇻🇳", vietnam: "🇻🇳",
  "אינדונזיה": "🇮🇩", indonesia: "🇮🇩", bali: "🇮🇩",
  "מקסיקו": "🇲🇽", mexico: "🇲🇽",
  "ברזיל": "🇧🇷", brazil: "🇧🇷",
  "קפריסין": "🇨🇾", cyprus: "🇨🇾",
  "אוסטריה": "🇦🇹", austria: "🇦🇹",
  "שוויץ": "🇨🇭", switzerland: "🇨🇭",
  "אלבניה": "🇦🇱", albania: "🇦🇱",
  "סרביה": "🇷🇸", serbia: "🇷🇸",
  "פולין": "🇵🇱", poland: "🇵🇱",
  "צ'כיה": "🇨🇿", czechia: "🇨🇿",
  "איחוד האמירויות": "🇦🇪", "דובאי": "🇦🇪", dubai: "🇦🇪", uae: "🇦🇪",
  "ישראל": "🇮🇱", israel: "🇮🇱",
};

export function countryFlag(country: string): string {
  const key = country.trim().toLowerCase();
  return FLAGS[key] ?? FLAGS[country.trim()] ?? "🌍";
}
