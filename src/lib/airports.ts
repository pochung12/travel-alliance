// 機場代碼 → 城市 / 機場中文名稱對照（以旅行社常用航線為主）
export interface AirportInfo { city: string; name: string; country?: string }

export const AIRPORTS: Record<string, AirportInfo> = {
  // ── 台灣 ──
  TPE: { city: "台北", name: "桃園國際機場", country: "台灣" },
  TSA: { city: "台北", name: "松山機場", country: "台灣" },
  KHH: { city: "高雄", name: "小港國際機場", country: "台灣" },
  RMQ: { city: "台中", name: "清泉崗機場", country: "台灣" },
  TNN: { city: "台南", name: "台南機場", country: "台灣" },
  HUN: { city: "花蓮", name: "花蓮機場", country: "台灣" },
  MZG: { city: "澎湖", name: "馬公機場", country: "台灣" },
  KNH: { city: "金門", name: "金門機場", country: "台灣" },

  // ── 中國大陸 ──
  PEK: { city: "北京", name: "首都國際機場", country: "中國" },
  PKX: { city: "北京", name: "大興國際機場", country: "中國" },
  PVG: { city: "上海", name: "浦東國際機場", country: "中國" },
  SHA: { city: "上海", name: "虹橋國際機場", country: "中國" },
  CAN: { city: "廣州", name: "白雲國際機場", country: "中國" },
  SZX: { city: "深圳", name: "寶安國際機場", country: "中國" },
  CTU: { city: "成都", name: "雙流國際機場", country: "中國" },
  TFU: { city: "成都", name: "天府國際機場", country: "中國" },
  CKG: { city: "重慶", name: "江北國際機場", country: "中國" },
  KWE: { city: "貴陽", name: "龍洞堡國際機場", country: "中國" },
  CGO: { city: "鄭州", name: "新鄭國際機場", country: "中國" },
  XIY: { city: "西安", name: "咸陽國際機場", country: "中國" },
  KMG: { city: "昆明", name: "長水國際機場", country: "中國" },
  HGH: { city: "杭州", name: "蕭山國際機場", country: "中國" },
  NKG: { city: "南京", name: "祿口國際機場", country: "中國" },
  XMN: { city: "廈門", name: "高崎國際機場", country: "中國" },
  TAO: { city: "青島", name: "膠東國際機場", country: "中國" },
  DLC: { city: "大連", name: "周水子國際機場", country: "中國" },
  SHE: { city: "瀋陽", name: "桃仙國際機場", country: "中國" },
  HRB: { city: "哈爾濱", name: "太平國際機場", country: "中國" },
  URC: { city: "烏魯木齊", name: "地窩堡國際機場", country: "中國" },
  CSX: { city: "長沙", name: "黃花國際機場", country: "中國" },
  WUH: { city: "武漢", name: "天河國際機場", country: "中國" },
  FOC: { city: "福州", name: "長樂國際機場", country: "中國" },
  TSN: { city: "天津", name: "濱海國際機場", country: "中國" },
  JJN: { city: "泉州", name: "晉江國際機場", country: "中國" },
  NNG: { city: "南寧", name: "吳圩國際機場", country: "中國" },
  KWL: { city: "桂林", name: "兩江國際機場", country: "中國" },
  HAK: { city: "海口", name: "美蘭國際機場", country: "中國" },
  SYX: { city: "三亞", name: "鳳凰國際機場", country: "中國" },
  LXA: { city: "拉薩", name: "貢嘎國際機場", country: "中國" },
  ZUH: { city: "珠海", name: "金灣機場", country: "中國" },
  WNZ: { city: "溫州", name: "龍灣國際機場", country: "中國" },
  NGB: { city: "寧波", name: "櫟社國際機場", country: "中國" },
  TYN: { city: "太原", name: "武宿國際機場", country: "中國" },
  LHW: { city: "蘭州", name: "中川國際機場", country: "中國" },
  XNN: { city: "西寧", name: "曹家堡機場", country: "中國" },
  KHN: { city: "南昌", name: "昌北國際機場", country: "中國" },
  HET: { city: "呼和浩特", name: "白塔國際機場", country: "中國" },
  DYG: { city: "張家界", name: "荷花國際機場", country: "中國" },
  JHG: { city: "西雙版納", name: "嘎灑國際機場", country: "中國" },
  LJG: { city: "麗江", name: "三義國際機場", country: "中國" },
  TNA: { city: "濟南", name: "遙牆國際機場", country: "中國" },
  HFE: { city: "合肥", name: "新橋國際機場", country: "中國" },
  CGQ: { city: "長春", name: "龍嘉國際機場", country: "中國" },
  YNT: { city: "煙台", name: "蓬萊國際機場", country: "中國" },
  SJW: { city: "石家莊", name: "正定國際機場", country: "中國" },
  INC: { city: "銀川", name: "河東國際機場", country: "中國" },
  AKU: { city: "阿克蘇", name: "阿克蘇機場", country: "中國" },
  KCA: { city: "庫車", name: "庫車龜茲機場", country: "中國" },
  KRY: { city: "克拉瑪依", name: "克拉瑪依機場", country: "中國" },
  YIN: { city: "伊寧", name: "伊寧機場", country: "中國" },
  KJI: { city: "喀納斯", name: "喀納斯機場", country: "中國" },
  HTN: { city: "和田", name: "和田機場", country: "中國" },
  KHG: { city: "喀什", name: "喀什機場", country: "中國" },

  // ── 港澳 ──
  HKG: { city: "香港", name: "香港國際機場", country: "香港" },
  MFM: { city: "澳門", name: "澳門國際機場", country: "澳門" },

  // ── 日本 ──
  NRT: { city: "東京", name: "成田國際機場", country: "日本" },
  HND: { city: "東京", name: "羽田機場", country: "日本" },
  KIX: { city: "大阪", name: "關西國際機場", country: "日本" },
  ITM: { city: "大阪", name: "伊丹機場", country: "日本" },
  CTS: { city: "札幌", name: "新千歲機場", country: "日本" },
  FUK: { city: "福岡", name: "福岡機場", country: "日本" },
  OKA: { city: "沖繩", name: "那霸機場", country: "日本" },
  NGO: { city: "名古屋", name: "中部國際機場", country: "日本" },
  SDJ: { city: "仙台", name: "仙台機場", country: "日本" },
  HKD: { city: "函館", name: "函館機場", country: "日本" },
  KOJ: { city: "鹿兒島", name: "鹿兒島機場", country: "日本" },
  HIJ: { city: "廣島", name: "廣島機場", country: "日本" },
  KMQ: { city: "金澤", name: "小松機場", country: "日本" },
  TAK: { city: "高松", name: "高松機場", country: "日本" },
  OKJ: { city: "岡山", name: "岡山機場", country: "日本" },
  KMJ: { city: "熊本", name: "熊本機場", country: "日本" },
  MYJ: { city: "松山", name: "松山機場", country: "日本" },
  IBR: { city: "茨城", name: "茨城機場", country: "日本" },
  AOJ: { city: "青森", name: "青森機場", country: "日本" },

  // ── 韓國 ──
  ICN: { city: "首爾", name: "仁川國際機場", country: "韓國" },
  GMP: { city: "首爾", name: "金浦國際機場", country: "韓國" },
  PUS: { city: "釜山", name: "金海國際機場", country: "韓國" },
  CJU: { city: "濟州", name: "濟州國際機場", country: "韓國" },
  TAE: { city: "大邱", name: "大邱國際機場", country: "韓國" },

  // ── 東南亞 ──
  BKK: { city: "曼谷", name: "素萬那普國際機場", country: "泰國" },
  DMK: { city: "曼谷", name: "廊曼國際機場", country: "泰國" },
  CNX: { city: "清邁", name: "清邁國際機場", country: "泰國" },
  HKT: { city: "普吉", name: "普吉國際機場", country: "泰國" },
  USM: { city: "蘇美島", name: "蘇美國際機場", country: "泰國" },
  SIN: { city: "新加坡", name: "樟宜國際機場", country: "新加坡" },
  KUL: { city: "吉隆坡", name: "吉隆坡國際機場", country: "馬來西亞" },
  PEN: { city: "檳城", name: "檳城國際機場", country: "馬來西亞" },
  BKI: { city: "亞庇", name: "亞庇國際機場", country: "馬來西亞" },
  SGN: { city: "胡志明市", name: "新山一國際機場", country: "越南" },
  HAN: { city: "河內", name: "內排國際機場", country: "越南" },
  DAD: { city: "峴港", name: "峴港國際機場", country: "越南" },
  CXR: { city: "芽莊", name: "金蘭國際機場", country: "越南" },
  PQC: { city: "富國島", name: "富國國際機場", country: "越南" },
  MNL: { city: "馬尼拉", name: "尼諾伊·艾奎諾國際機場", country: "菲律賓" },
  CEB: { city: "宿霧", name: "麥克坦-宿霧國際機場", country: "菲律賓" },
  CRK: { city: "克拉克", name: "克拉克國際機場", country: "菲律賓" },
  CGK: { city: "雅加達", name: "蘇加諾-哈達國際機場", country: "印尼" },
  DPS: { city: "峇里島", name: "伍拉·賴國際機場", country: "印尼" },
  PNH: { city: "金邊", name: "金邊國際機場", country: "柬埔寨" },
  REP: { city: "暹粒", name: "暹粒吳哥國際機場", country: "柬埔寨" },
  RGN: { city: "仰光", name: "仰光國際機場", country: "緬甸" },
  VTE: { city: "永珍", name: "瓦岱國際機場", country: "寮國" },

  // ── 南亞 / 中東 ──
  DEL: { city: "德里", name: "英迪拉·甘地國際機場", country: "印度" },
  BOM: { city: "孟買", name: "賈特拉帕蒂·希瓦吉國際機場", country: "印度" },
  CMB: { city: "可倫坡", name: "班達拉奈克國際機場", country: "斯里蘭卡" },
  MLE: { city: "馬列", name: "維拉納國際機場", country: "馬爾地夫" },
  KTM: { city: "加德滿都", name: "特里布萬國際機場", country: "尼泊爾" },
  DXB: { city: "杜拜", name: "杜拜國際機場", country: "阿聯" },
  AUH: { city: "阿布達比", name: "阿布達比國際機場", country: "阿聯" },
  DOH: { city: "多哈", name: "哈馬德國際機場", country: "卡達" },
  IST: { city: "伊斯坦堡", name: "伊斯坦堡機場", country: "土耳其" },

  // ── 大洋洲 ──
  SYD: { city: "雪梨", name: "金斯福德·史密斯機場", country: "澳洲" },
  MEL: { city: "墨爾本", name: "墨爾本機場", country: "澳洲" },
  BNE: { city: "布里斯本", name: "布里斯本機場", country: "澳洲" },
  PER: { city: "伯斯", name: "伯斯機場", country: "澳洲" },
  ADL: { city: "阿德雷德", name: "阿德雷德機場", country: "澳洲" },
  CNS: { city: "凱恩斯", name: "凱恩斯機場", country: "澳洲" },
  AKL: { city: "奧克蘭", name: "奧克蘭機場", country: "紐西蘭" },
  CHC: { city: "基督城", name: "基督城機場", country: "紐西蘭" },
  ZQN: { city: "皇后鎮", name: "皇后鎮機場", country: "紐西蘭" },
  GUM: { city: "關島", name: "安東尼奧·王太安國際機場", country: "關島" },
  ROR: { city: "帛琉", name: "羅曼·托梅索克國際機場", country: "帛琉" },
  NAN: { city: "楠迪", name: "楠迪國際機場", country: "斐濟" },

  // ── 歐洲 ──
  LHR: { city: "倫敦", name: "希斯洛機場", country: "英國" },
  LGW: { city: "倫敦", name: "蓋威克機場", country: "英國" },
  CDG: { city: "巴黎", name: "戴高樂機場", country: "法國" },
  ORY: { city: "巴黎", name: "奧利機場", country: "法國" },
  FRA: { city: "法蘭克福", name: "法蘭克福機場", country: "德國" },
  MUC: { city: "慕尼黑", name: "慕尼黑機場", country: "德國" },
  AMS: { city: "阿姆斯特丹", name: "史基浦機場", country: "荷蘭" },
  ZRH: { city: "蘇黎世", name: "蘇黎世機場", country: "瑞士" },
  VIE: { city: "維也納", name: "維也納國際機場", country: "奧地利" },
  FCO: { city: "羅馬", name: "菲烏米奇諾機場", country: "義大利" },
  MXP: { city: "米蘭", name: "馬爾彭薩機場", country: "義大利" },
  VCE: { city: "威尼斯", name: "馬可波羅機場", country: "義大利" },
  BCN: { city: "巴塞隆納", name: "埃爾普拉特機場", country: "西班牙" },
  MAD: { city: "馬德里", name: "巴拉哈斯機場", country: "西班牙" },
  LIS: { city: "里斯本", name: "里斯本機場", country: "葡萄牙" },
  CPH: { city: "哥本哈根", name: "凱斯楚普機場", country: "丹麥" },
  ARN: { city: "斯德哥爾摩", name: "阿蘭達機場", country: "瑞典" },
  OSL: { city: "奧斯陸", name: "加勒穆恩機場", country: "挪威" },
  HEL: { city: "赫爾辛基", name: "萬塔機場", country: "芬蘭" },
  KEF: { city: "雷克雅維克", name: "凱夫拉維克機場", country: "冰島" },
  PRG: { city: "布拉格", name: "瓦茨拉夫·哈維爾機場", country: "捷克" },
  BUD: { city: "布達佩斯", name: "李斯特·費倫茨機場", country: "匈牙利" },
  WAW: { city: "華沙", name: "蕭邦機場", country: "波蘭" },
  ATH: { city: "雅典", name: "雅典國際機場", country: "希臘" },
  SVO: { city: "莫斯科", name: "謝列梅捷沃國際機場", country: "俄羅斯" },
  BRU: { city: "布魯塞爾", name: "布魯塞爾機場", country: "比利時" },
  DUB: { city: "都柏林", name: "都柏林機場", country: "愛爾蘭" },

  // ── 美洲 ──
  LAX: { city: "洛杉磯", name: "洛杉磯國際機場", country: "美國" },
  SFO: { city: "舊金山", name: "舊金山國際機場", country: "美國" },
  SEA: { city: "西雅圖", name: "西雅圖-塔科馬國際機場", country: "美國" },
  JFK: { city: "紐約", name: "甘迺迪國際機場", country: "美國" },
  EWR: { city: "紐約", name: "紐華克自由國際機場", country: "美國" },
  ORD: { city: "芝加哥", name: "歐海爾國際機場", country: "美國" },
  IAD: { city: "華盛頓", name: "杜勒斯國際機場", country: "美國" },
  BOS: { city: "波士頓", name: "洛根國際機場", country: "美國" },
  MIA: { city: "邁阿密", name: "邁阿密國際機場", country: "美國" },
  MCO: { city: "奧蘭多", name: "奧蘭多國際機場", country: "美國" },
  LAS: { city: "拉斯維加斯", name: "哈里·里德國際機場", country: "美國" },
  HNL: { city: "檀香山", name: "丹尼爾·井上國際機場", country: "美國" },
  YVR: { city: "溫哥華", name: "溫哥華國際機場", country: "加拿大" },
  YYZ: { city: "多倫多", name: "皮爾遜國際機場", country: "加拿大" },
  YUL: { city: "蒙特婁", name: "特魯多國際機場", country: "加拿大" },

  // ── 非洲 ──
  CAI: { city: "開羅", name: "開羅國際機場", country: "埃及" },
  JNB: { city: "約翰尼斯堡", name: "奧利弗·坦博國際機場", country: "南非" },
  CPT: { city: "開普敦", name: "開普敦國際機場", country: "南非" },
};

// ── 桃園機場（TPE）航空公司 → 航廈 ────────────────────────────────────────────
// 來源：桃園國際機場官網「航空公司查詢」https://www.taoyuan-airport.com/airlines
export const TPE_TERMINAL: Record<string, string> = {
  HO: "1", CZ: "2", CA: "2", MU: "2", D7: "1", NH: "2", AC: "2", GA: "1", RF: "1",
  IT: "1", "3U": "1", CX: "1", TK: "2", HB: "1", KE: "1", "9G": "1", "5J": "1",
  SC: "2", ID: "1", MF: "2", TW: "1", GK: "1", SQ: "2", JL: "2", NU: "2", ZE: "1",
  JX: "1", "7G": "1", "9C": "1", QD: "1", MM: "1", "4V": "1", BI: "1", NS: "2",
  FD: "1", TG: "1", SL: "1", VZ: "1", HU: "2", ZH: "2", NX: "1", "7C": "1",
  LJ: "1", B7: "2", NZ: "2", DL: "2", UA: "2", KL: "2", AE: "1", Z2: "1", RW: "1",
  PR: "1", S7: "1", BL: "1", VN: "2", VJ: "1", QH: "1", TR: "1", BX: "2", BR: "2",
  EY: "2", EK: "2", OZ: "2", UO: "1", HX: "2", AK: "1", MH: "1", OD: "1",
};

// 華航 CI 依航線分航廈：美(含關島)、加、澳、日與兩岸航線在 T2，其餘 T1
const CI_T2_COUNTRIES = new Set(["美國", "加拿大", "澳洲", "關島", "日本", "中國"]);

/** 由航班號取航空公司代碼（CZ3024 → CZ、3U8888 → 3U）*/
export function airlineCode(flightNumber?: string | null): string {
  const s = (flightNumber || "").toUpperCase().replace(/\s+/g, "");
  const m = s.match(/^([A-Z]{2}|[A-Z]\d|\d[A-Z])/);
  return m ? m[1] : "";
}

/**
 * 依官方資料推定航廈（目前支援桃園 TPE）
 * @param airport      要查航廈的機場代碼
 * @param flightNumber 航班號
 * @param otherAirport 航線另一端機場代碼（華航分航廈時需要）
 */
export function knownTerminal(
  airport?: string | null,
  flightNumber?: string | null,
  otherAirport?: string | null,
): string {
  const ap = (airport || "").trim().toUpperCase();
  if (ap !== "TPE") return "";
  const al = airlineCode(flightNumber);
  if (!al) return "";
  if (al === "CI") {
    const other = airportInfo(otherAirport);
    if (!other?.country) return "";
    return CI_T2_COUNTRIES.has(other.country) ? "2" : "1";
  }
  return TPE_TERMINAL[al] || "";
}

/** 查機場資訊（代碼不分大小寫；查無則回傳 null）*/
export function airportInfo(code?: string | null): AirportInfo | null {
  if (!code) return null;
  return AIRPORTS[code.trim().toUpperCase()] || null;
}

/** 航廈格式化：T2 / 2 / 第二航廈 → 「第 2 航廈」；無資料回空字串 */
export function terminalLabel(t?: string | null): string {
  const raw = (t || "").trim();
  if (!raw) return "";
  const m = raw.match(/(\d+)/);
  if (m) return `第 ${m[1]} 航廈`;
  const cn = raw.match(/[一二三四五六七八九]/);
  if (cn) return `第 ${cn[0]} 航廈`;
  return raw;  // 例如 "國際線"、"Main"
}
