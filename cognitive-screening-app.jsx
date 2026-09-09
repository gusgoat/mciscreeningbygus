import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  Brain,
  ClipboardList,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  Printer,
  Check,
  AlertTriangle,
  User,
  Lightbulb,
  Info,
  Clock,
  ImagePlus,
} from "lucide-react";

/* ===================================================================
   แบบทดสอบสภาพสมองเบื้องต้น — เครื่องมือคัดกรองเชิงโดเมน
   ออกแบบหน้าที่: ผู้ตรวจอ่านคำถาม → ให้คะแนนแต่ละข้อ → ระบบสรุปเป็น
   โปรไฟล์ตามโดเมนปัญญา และชี้ตำแหน่งสมองที่น่าจะเกี่ยวข้อง (เชิงชี้แนะ)
   =================================================================== */

const C = {
  ink: "#18272b",
  inkSoft: "#3c4f54",
  muted: "#5d6f73",
  paper: "#e9efed",
  card: "#ffffff",
  line: "#d3ddda",
  primary: "#115e6c",
  primaryDeep: "#0a3b45",
  accent: "#cf5b43",
  amber: "#d99b2b",
  green: "#2e8b6a",
  neutral: "#cfd8d6",
};

const STATUS = {
  intact: { color: C.green, label: "ปกติ" },
  borderline: { color: C.amber, label: "ก้ำกึ่ง" },
  concern: { color: C.accent, label: "ควรให้ความสนใจ" },
  na: { color: C.neutral, label: "ไม่ได้ทดสอบโดยตรง" },
};

function statusFromPct(pct) {
  if (pct >= 80) return "intact";
  if (pct >= 50) return "borderline";
  return "concern";
}

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/* ช่วงเวลาเหมาะสมสำหรับถาม delayed recall: ~3–5 นาที */
function recallWindow(sec) {
  if (sec < 180)
    return { text: "ยังไม่ถึงช่วงถาม (รอให้ครบ ~3 นาที)", color: C.amber, key: "early" };
  if (sec <= 300)
    return { text: "ช่วงเหมาะสมที่จะถามข้อจำคำ", color: C.green, key: "ok" };
  return { text: "เลยช่วง 5 นาทีแล้ว — ควรถามโดยเร็ว", color: C.accent, key: "late" };
}

/* ย่อรูปที่อัปโหลดให้เล็กลงก่อนเก็บ เพื่อให้บันทึกข้ามครั้งได้ */
function downscaleImage(file, maxDim = 320) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ----------------------- โครงสร้างโดเมน ----------------------- */
const DOMAINS = {
  memory: {
    label: "ความจำและการรับรู้เวลา",
    region: "สมองกลีบขมับส่วนใน / ฮิปโปแคมปัส",
    regionEn: "Medial temporal lobe · Hippocampus",
    note: "ไวต่อโรคอัลไซเมอร์ระยะแรกที่สุด ข้อจำคำและการรับรู้วันเวลามักผิดก่อน",
  },
  attention: {
    label: "สมาธิและความจำขณะใช้งาน",
    region: "สมองกลีบหน้า (ส่วนหน้า-ข้าง)",
    regionEn: "Frontal · Dorsolateral prefrontal",
    note: "เสียในภาวะสมองเสื่อมหลอดเลือด เพ้อสับสน หรือสมองส่วนหน้าเสื่อม",
  },
  language: {
    label: "ภาษาและความจำเชิงความหมาย",
    region: "สมองกลีบขมับ",
    regionEn: "Temporal lobe",
    note: "เรียกชื่อสิ่งของไม่ได้ ลืมความหมายคำ พบในกลุ่มภาษาเสื่อม (PPA)",
  },
  visuospatial: {
    label: "การรับรู้มิติสัมพันธ์",
    region: "สมองกลีบข้าง",
    regionEn: "Parietal lobe",
    note: "เสียเด่นในสมองฝ่อส่วนหลัง (PCA) และภาวะ Lewy body",
  },
  executive: {
    label: "การบริหารจัดการ / คิดเชิงนามธรรม",
    region: "สมองกลีบหน้า (ส่วนหน้าสุด)",
    regionEn: "Frontal · Prefrontal",
    note: "วางแผน คิดเปรียบเทียบ ตีความสุภาษิต พบเสียในสมองส่วนหน้าเสื่อม (FTD)",
  },
  social: {
    label: "การรับรู้อารมณ์และสังคม",
    region: "สมองซีกขวา / ออร์บิโตฟรอนทัล-ขมับ",
    regionEn: "Right hemisphere · Orbitofrontal-temporal",
    note: "อ่านสีหน้า/อารมณ์ผิด เป็นสัญญาณเด่นของสมองส่วนหน้าเสื่อม (bvFTD)",
  },
};

/* ----------------------- ข้อสอบ 12 ข้อ ----------------------- */
/* แต่ละ part มี pts; คะแนนข้อ = ผลรวม pts ที่ติ๊ก */
function buildItems(wordSet, pmAnswer) {
  return [
    {
      id: 1,
      domain: "memory",
      title: "การรับรู้วันเวลา",
      prompt: "ถามผู้ป่วยว่า “วันนี้ วัน / เดือน / ปี อะไร”",
      parts: [
        { label: "บอกวันที่ (วันในสัปดาห์ / วันที่) ถูกต้อง", pts: 1 },
        { label: "บอกเดือนถูกต้อง", pts: 1 },
        { label: "บอกปี (พ.ศ.) ถูกต้อง", pts: 1 },
      ],
      guide: "ให้ข้อละ 1 คะแนน ตรวจเทียบกับวันที่จริงด้านล่าง",
      showToday: true,
    },
    {
      id: 2,
      domain: "attention",
      title: "ท่องเดือนย้อนหลัง",
      prompt: "ให้ท่องชื่อเดือนย้อนหลัง จากธันวาคม ไปจนถึง มกราคม",
      parts: [{ label: "ท่องย้อนหลังได้ครบและถูกลำดับ", pts: 1 }],
      guide: "ลำดับที่ถูก: ธ.ค. – พ.ย. – ต.ค. – ก.ย. – ส.ค. – ก.ค. – มิ.ย. – พ.ค. – เม.ย. – มี.ค. – ก.พ. – ม.ค.",
    },
    {
      id: 3,
      domain: "attention",
      title: "ลบเลขต่อเนื่อง (100 ลบ 7)",
      prompt: "ให้คิดในใจ 100 − 7 แล้วลบ 7 ต่อไปอีก รวม 3 ครั้ง",
      parts: [
        { label: "100 − 7 = 93", pts: 1 },
        { label: "93 − 7 = 86", pts: 1 },
        { label: "86 − 7 = 79", pts: 1 },
      ],
      guide: "ให้คะแนนตามจำนวนคำตอบที่ถูก (ถ้าลบผิดแต่ขั้นถัดไป −7 ถูกจากตัวเดิม ให้ถือว่าขั้นนั้นถูก)",
    },
    {
      id: 4,
      domain: "language",
      title: "เรียกชื่อสัตว์จากภาพ",
      prompt: "ให้ดูภาพแล้วบอกว่าเป็นสัตว์อะไร",
      visual: "animals",
      parts: [
        { label: "สิงโต", pts: 1 },
        { label: "แรด", pts: 1 },
        { label: "ยีราฟ", pts: 1 },
      ],
      guide: "ให้ข้อละ 1 คะแนน ตามชื่อที่ถูกต้อง",
    },
    {
      id: 5,
      domain: "executive",
      title: "วาดหน้าปัดนาฬิกา (11.10 น.)",
      prompt: "ให้ผู้ป่วยวาดหน้าปัดนาฬิกาและแสดงเวลา 11.10 น.",
      parts: [
        { label: "วาดวงหน้าปัดเป็นวงกลมพอใช้", pts: 1 },
        { label: "ใส่ตัวเลข 1–12 ครบและตำแหน่งถูก", pts: 1 },
        { label: "เข็มชี้เวลา 11.10 น. ถูกต้อง", pts: 1 },
      ],
      guide:
        "ข้อนี้ใช้ทั้งสมองส่วนหน้า (วางแผน-จัดลำดับ) และสมองกลีบข้าง (มิติสัมพันธ์) จึงเป็นข้อที่ไวมาก",
    },
    {
      id: 6,
      domain: "language",
      title: "ปริศนาความหมายคำ",
      prompt:
        "ของสิ่งใดเป็นที่นอนทำจากเชือกสาน ผูกระหว่างต้นไม้สองต้น แกว่งไปมาได้ เรียกว่าอะไร",
      parts: [{ label: "ตอบว่า “เปลญวน” (หรือ เปล) ถูกต้อง", pts: 1 }],
      guide: "ทดสอบการเรียกคืนคำตามความหมาย (semantic retrieval)",
    },
    {
      id: 7,
      domain: "executive",
      title: "อธิบายความหมายสุภาษิต",
      prompt: "ให้ผู้ป่วยอธิบายความหมายของสุภาษิตต่อไปนี้",
      parts: [
        {
          label: "“ขี่ช้างจับตั๊กแตน” — ลงทุนลงแรงมากเกินกับเรื่องเล็ก ไม่คุ้มค่า",
          pts: 1,
        },
        {
          label: "“น้ำขึ้นให้รีบตัก” — มีโอกาสดีต้องรีบคว้าไว้",
          pts: 1,
        },
      ],
      guide:
        "ให้คะแนนถ้าตีความเชิงนามธรรมได้ ไม่ใช่อธิบายตามตัวอักษร (เช่น “ช้างจับตั๊กแตน” ตามตัว = ไม่ผ่าน)",
    },
    {
      id: 8,
      domain: "visuospatial",
      title: "นับจำนวนกล่อง (สามมิติ)",
      prompt: "ให้นับจำนวนกล่องลูกบาศก์ในแต่ละรูป (รวมกล่องที่ถูกบังด้วย)",
      visual: "cubes",
      parts: [
        { label: "รูปที่ 1 = 5 กล่อง", pts: 1 },
        { label: "รูปที่ 2 = 7 กล่อง", pts: 1 },
        { label: "รูปที่ 3 = 11 กล่อง", pts: 1 },
      ],
      guide: "เฉลย: 5, 7, 11 — ทดสอบการนึกภาพสามมิติของสมองกลีบข้าง",
    },
    {
      id: 9,
      domain: "language",
      title: "นายกรัฐมนตรีคนปัจจุบัน",
      prompt: "ถามว่านายกรัฐมนตรีคนปัจจุบันชื่ออะไร",
      parts: [
        { label: "รู้ว่ากำลังพูดถึงผู้นำประเทศคนปัจจุบัน", pts: 1 },
        { label: `บอกชื่อถูกต้อง (${pmAnswer})`, pts: 1 },
      ],
      guide:
        "เฉลยปรับได้ตามช่วงเวลา ตั้งค่าได้ที่หน้าเริ่มต้น — ทดสอบความจำเหตุการณ์ปัจจุบัน",
      editableAnswer: true,
    },
    {
      id: 10,
      domain: "memory",
      title: "ทบทวนคำที่ให้จำไว้ (5 คำ)",
      prompt: "ให้บอกคำ 5 คำที่ให้จำไว้ตั้งแต่ต้นแบบทดสอบ",
      parts: wordSet.map((w) => ({ label: `จำคำว่า “${w}” ได้`, pts: 1 })),
      guide:
        "การจำคำหลังเว้นช่วง (delayed recall) คือข้อสำคัญที่สุดของการคัดกรองอัลไซเมอร์",
      isRecall: true,
    },
    {
      id: 11,
      domain: "social",
      title: "อ่านอารมณ์จากสีหน้า",
      prompt: "ให้ดูใบหน้าแต่ละภาพ แล้วบอกว่าเขากำลังรู้สึกอย่างไร",
      visual: "faces",
      parts: [
        { label: "ภาพที่ 1 — มีความสุข / ยิ้ม / ดีใจ", pts: 1 },
        { label: "ภาพที่ 2 — โกรธ / โมโห", pts: 1 },
        { label: "ภาพที่ 3 — ครุ่นคิด / สงสัย / กังวล", pts: 1 },
      ],
      guide: "รับคำตอบที่ใกล้เคียงในกลุ่มอารมณ์เดียวกันได้",
    },
    {
      id: 12,
      domain: "attention",
      title: "ท่องวันในสัปดาห์ย้อนหลัง",
      prompt: "ให้ท่องชื่อวันย้อนหลัง โดยเริ่มจากวันอาทิตย์",
      parts: [{ label: "ท่องย้อนหลังได้ครบและถูกลำดับ", pts: 1 }],
      guide: "ลำดับที่ถูก: อาทิตย์ – เสาร์ – ศุกร์ – พฤหัสบดี – พุธ – อังคาร – จันทร์",
    },
  ];
}

const DEFAULT_WORDS = ["ดอกบัว", "รถไฟ", "นาฬิกา", "ภูเขา", "แมว"];
const DEFAULT_PM = "อนุทิน ชาญวีรกูล";
const TOTAL_MAX = 30;

/* ===================================================================
   ภาพประกอบ
   =================================================================== */

function Animals() {
  const data = [
    { e: "🦁", n: "สิงโต" },
    { e: "🦏", n: "แรด" },
    { e: "🦒", n: "ยีราฟ" },
  ];
  return (
    <div className="flex justify-around gap-3 flex-wrap">
      {data.map((a, i) => (
        <div
          key={i}
          className="flex flex-col items-center justify-center rounded-2xl px-6 py-4"
          style={{ background: "#f3f7f6", border: `1px solid ${C.line}`, minWidth: 96 }}
        >
          <span style={{ fontSize: 52, lineHeight: 1 }}>{a.e}</span>
          <span className="mt-1 text-xs" style={{ color: C.muted }}>
            {i + 1}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ใบหน้าคนแบบ SVG สื่ออารมณ์ (แทนภาพถ่ายจริงเพื่อเลี่ยงปัญหาลิขสิทธิ์/ความเป็นส่วนตัว) */
function FacePortrait({ emotion }) {
  const skin = "#e9b58e";
  const skinShade = "#d49b73";
  const hair = "#3f2d1d";
  const shirt = "#5f86a6";
  const shirtDark = "#4f7392";
  const stroke = "#5a4636";

  const Brows = () => {
    if (emotion === "angry")
      return (
        <g stroke={hair} strokeWidth="3.4" strokeLinecap="round" fill="none">
          <path d="M42,50 L60,55" />
          <path d="M88,50 L70,55" />
          <path d="M63,47 L63,52" strokeWidth="1.6" />
          <path d="M67,47 L67,52" strokeWidth="1.6" />
        </g>
      );
    if (emotion === "thinking")
      return (
        <g stroke={hair} strokeWidth="3.4" strokeLinecap="round" fill="none">
          <path d="M43,51 Q52,49 60,51" />
          <path d="M70,45 Q79,41 88,46" />
        </g>
      );
    return (
      <g stroke={hair} strokeWidth="3.4" strokeLinecap="round" fill="none">
        <path d="M43,49 Q52,46 61,49" />
        <path d="M69,49 Q78,46 87,49" />
      </g>
    );
  };

  const Eyes = () => {
    const up = emotion === "thinking" ? -1.6 : 0;
    const right = emotion === "thinking" ? 1.4 : 0;
    return (
      <g>
        <ellipse cx="52" cy="61" rx="7" ry="5" fill="#fff" />
        <ellipse cx="78" cy="61" rx="7" ry="5" fill="#fff" />
        <circle cx={52 + right} cy={61 + up} r="3.4" fill="#5b4632" />
        <circle cx={78 + right} cy={61 + up} r="3.4" fill="#5b4632" />
        <circle cx={52 + right} cy={61 + up} r="1.6" fill="#241a12" />
        <circle cx={78 + right} cy={61 + up} r="1.6" fill="#241a12" />
        {/* upper lids */}
        <path d="M45,59 Q52,55 59,59" stroke={stroke} strokeWidth="1.3" fill="none" />
        <path d="M71,59 Q78,55 85,59" stroke={stroke} strokeWidth="1.3" fill="none" />
        {emotion === "happy" && (
          <g stroke={stroke} strokeWidth="1.2" fill="none">
            <path d="M46,63 Q52,66 58,63" />
            <path d="M72,63 Q78,66 84,63" />
          </g>
        )}
      </g>
    );
  };

  const Mouth = () => {
    if (emotion === "happy")
      return (
        <g>
          <path d="M48,82 Q65,100 82,82 Q65,90 48,82 Z" fill="#8a3d35" />
          <path d="M51,83 Q65,90 79,83 Q65,86 51,83 Z" fill="#fff" />
        </g>
      );
    if (emotion === "angry")
      return (
        <g>
          <ellipse cx="65" cy="88" rx="11" ry="9" fill="#6e2f2a" />
          <path d="M55,84 Q65,86 75,84 Q65,87 55,84 Z" fill="#fff" />
        </g>
      );
    // thinking — pensive, slightly pressed to one side
    return (
      <path
        d="M57,89 Q66,86 75,90"
        stroke="#8a4a3f"
        strokeWidth="2.6"
        strokeLinecap="round"
        fill="none"
      />
    );
  };

  return (
    <svg width="130" height="150" viewBox="0 0 130 150">
      <circle cx="65" cy="70" r="62" fill="#eef4f3" />
      {/* shirt */}
      <path d="M20,150 C24,120 44,110 65,110 C86,110 106,120 110,150 Z" fill={shirt} />
      <path d="M58,110 L65,124 L72,110 Z" fill={shirtDark} />
      {/* neck */}
      <path d="M54,98 Q54,116 65,118 Q76,116 76,98 Z" fill={skinShade} />
      {/* ears */}
      <ellipse cx="31" cy="66" rx="7" ry="11" fill={skinShade} />
      <ellipse cx="99" cy="66" rx="7" ry="11" fill={skinShade} />
      {/* head */}
      <ellipse cx="65" cy="62" rx="34" ry="40" fill={skin} />
      {/* hair */}
      <path
        d="M30,56 C29,24 54,12 65,12 C76,12 101,24 100,56 C100,42 92,31 79,30 C85,35 87,41 87,44 C81,35 71,32 65,32 C59,32 49,35 43,44 C43,41 45,35 51,30 C38,31 30,42 30,56 Z"
        fill={hair}
      />
      <Brows />
      <Eyes />
      {/* nose */}
      <path
        d="M65,60 L60,75 Q65,79 70,75"
        stroke={skinShade}
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
      <Mouth />
      {/* hand on chin for thinking */}
      {emotion === "thinking" && (
        <g>
          <path d="M52,150 Q48,118 60,108 L80,108 Q92,118 88,150 Z" fill={skin} />
          <path d="M58,112 Q56,118 60,120 L78,120 Q82,118 80,112 Z" fill={skinShade} opacity="0.5" />
          {/* curled fingers along the cheek */}
          <rect x="60" y="92" width="6" height="22" rx="3" fill={skin} />
          <rect x="67" y="90" width="6" height="24" rx="3" fill={skin} />
          <rect x="74" y="93" width="6" height="21" rx="3" fill={skin} />
          <path d="M60,99 H80 M60,106 H80" stroke={skinShade} strokeWidth="1" opacity="0.6" />
        </g>
      )}
    </svg>
  );
}

function Faces({ faceImages = {} }) {
  const data = [
    { e: "happy", n: "ภาพที่ 1" },
    { e: "angry", n: "ภาพที่ 2" },
    { e: "thinking", n: "ภาพที่ 3" },
  ];
  return (
    <div className="flex justify-around gap-3 flex-wrap">
      {data.map((f, i) => (
        <div
          key={i}
          className="flex flex-col items-center justify-center rounded-2xl px-2 py-2"
          style={{ background: "#f3f7f6", border: `1px solid ${C.line}` }}
        >
          {faceImages[f.e] ? (
            <img
              src={faceImages[f.e]}
              alt={f.n}
              style={{
                width: 130,
                height: 150,
                objectFit: "cover",
                borderRadius: 12,
              }}
            />
          ) : (
            <FacePortrait emotion={f.e} />
          )}
          <span className="mt-0.5 text-xs" style={{ color: C.muted }}>
            {f.n}
          </span>
        </div>
      ))}
    </div>
  );
}

/* การวาดกล่องลูกบาศก์แบบ isometric ด้วย painter's algorithm */
function CubeFigure({ cells, hue, label }) {
  const TW = 22; // half width
  const TH = 11; // half height
  const CH = 24; // cube pixel height
  const ox = 70;
  const oy = 28;
  const P = (gx, gy, gz) => [
    ox + (gx - gy) * TW,
    oy + (gx + gy) * TH - gz * CH,
  ];
  const top = hue.top;
  const left = hue.left;
  const right = hue.right;

  const sorted = [...cells].sort(
    (a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]) || a[2] - b[2]
  );

  const polys = [];
  sorted.forEach(([x, y, z], idx) => {
    const A = P(x, y, z + 1);
    const B = P(x + 1, y, z + 1);
    const Cc = P(x + 1, y + 1, z + 1);
    const D = P(x, y + 1, z + 1);
    const B2 = P(x + 1, y, z);
    const C2 = P(x + 1, y + 1, z);
    const D2 = P(x, y + 1, z);
    const pt = (p) => p.join(",");
    polys.push(
      <g key={idx}>
        <polygon
          points={`${pt(A)} ${pt(B)} ${pt(Cc)} ${pt(D)}`}
          fill={top}
          stroke={C.primaryDeep}
          strokeWidth="1.1"
          strokeLinejoin="round"
        />
        <polygon
          points={`${pt(D)} ${pt(Cc)} ${pt(C2)} ${pt(D2)}`}
          fill={left}
          stroke={C.primaryDeep}
          strokeWidth="1.1"
          strokeLinejoin="round"
        />
        <polygon
          points={`${pt(B)} ${pt(Cc)} ${pt(C2)} ${pt(B2)}`}
          fill={right}
          stroke={C.primaryDeep}
          strokeWidth="1.1"
          strokeLinejoin="round"
        />
      </g>
    );
  });

  return (
    <div
      className="flex flex-col items-center rounded-2xl py-3"
      style={{ background: "#f3f7f6", border: `1px solid ${C.line}` }}
    >
      <svg width="170" height="170" viewBox="0 0 170 170">
        {polys}
      </svg>
      <span className="text-xs" style={{ color: C.muted }}>
        {label}
      </span>
    </div>
  );
}

function Cubes() {
  const figs = [
    {
      label: "รูปที่ 1",
      hue: { top: "#cdbdf0", left: "#a78fe0", right: "#8b6fd6" },
      cells: [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
        [1, 1, 0],
        [0, 0, 1],
      ],
    },
    {
      label: "รูปที่ 2",
      hue: { top: "#f6c3a6", left: "#ec9d74", right: "#e0824f" },
      cells: [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
        [1, 1, 0],
        [0, 0, 1],
        [1, 0, 1],
        [0, 0, 2],
      ],
    },
    {
      label: "รูปที่ 3",
      hue: { top: "#bfe3b8", left: "#90cd86", right: "#6cba60" },
      cells: [
        [0, 0, 0],
        [1, 0, 0],
        [2, 0, 0],
        [0, 1, 0],
        [1, 1, 0],
        [2, 1, 0],
        [0, 0, 1],
        [1, 0, 1],
        [2, 0, 1],
        [0, 0, 2],
        [1, 0, 2],
      ],
    },
  ];
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
      {figs.map((f, i) => (
        <CubeFigure key={i} {...f} />
      ))}
    </div>
  );
}

/* ===================================================================
   แผนที่สมอง (signature element)
   =================================================================== */
function BrainMap({ regionStatus }) {
  // regionStatus: { frontal, parietal, temporal, hippocampus } => status key
  const col = (k) => STATUS[regionStatus[k] || "na"].color;
  const outline =
    "M64,128 C50,86 96,52 144,54 C180,42 236,44 274,66 C314,90 322,130 300,152 C320,170 306,196 276,190 C264,200 246,196 234,184 C212,200 168,200 140,188 C104,196 66,182 66,148 C62,140 62,134 64,128 Z";

  return (
    <svg width="100%" viewBox="0 0 360 230" style={{ maxWidth: 460 }}>
      <defs>
        <clipPath id="brainClip">
          <path d={outline} />
        </clipPath>
      </defs>

      <g clipPath="url(#brainClip)">
        <rect x="40" y="30" width="80" height="200" fill={col("frontal")} opacity="0.85" />
        <rect x="240" y="30" width="120" height="200" fill={C.neutral} opacity="0.6" />
        <rect x="120" y="30" width="125" height="115" fill={col("parietal")} opacity="0.85" />
        <rect x="100" y="138" width="150" height="92" fill={col("temporal")} opacity="0.85" />
        {/* hippocampus marker */}
        <ellipse
          cx="170"
          cy="162"
          rx="20"
          ry="12"
          fill={col("hippocampus")}
          stroke="#ffffff"
          strokeWidth="2.5"
        />
      </g>

      {/* dividers + outline */}
      <path d={outline} fill="none" stroke={C.primaryDeep} strokeWidth="2.4" />
      <path
        d="M120,40 C124,90 122,150 120,196"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2"
        opacity="0.7"
      />
      <path
        d="M104,140 C150,128 210,130 250,140"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2"
        opacity="0.7"
      />
      <path
        d="M243,46 C250,96 250,150 246,188"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2"
        opacity="0.55"
      />

      {/* labels */}
      <text x="78" y="118" textAnchor="middle" fontSize="12" fill={C.ink} fontWeight="600">
        หน้า
      </text>
      <text x="182" y="96" textAnchor="middle" fontSize="12" fill={C.ink} fontWeight="600">
        ข้าง
      </text>
      <text x="172" y="208" textAnchor="middle" fontSize="12" fill={C.ink} fontWeight="600">
        ขมับ
      </text>
      <text x="296" y="118" textAnchor="middle" fontSize="11" fill={C.muted}>
        ท้ายทอย
      </text>
      <text x="170" y="166" textAnchor="middle" fontSize="9" fill="#ffffff" fontWeight="700">
        ฮิปโป
      </text>
    </svg>
  );
}

/* ===================================================================
   ส่วนประกอบ UI ย่อย
   =================================================================== */
function Pill({ children, bg, color }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ background: bg, color }}
    >
      {children}
    </span>
  );
}

function Progress({ value, max }) {
  return (
    <div className="h-1.5 w-full rounded-full" style={{ background: C.line }}>
      <div
        className="h-1.5 rounded-full transition-all"
        style={{ width: `${(value / max) * 100}%`, background: C.primary }}
      />
    </div>
  );
}

function PrimaryButton({ children, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-opacity"
      style={{
        background: disabled ? C.neutral : C.primary,
        color: "#fff",
        opacity: disabled ? 0.6 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

function GhostButton({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
      style={{ background: "transparent", color: C.primary, border: `1px solid ${C.line}` }}
    >
      {children}
    </button>
  );
}

/* ===================================================================
   หน้าจอหลัก
   =================================================================== */
export default function App() {
  const [screen, setScreen] = useState("intro"); // intro | register | test | results
  const [patient, setPatient] = useState({ name: "", age: "" });
  const [wordSet, setWordSet] = useState(DEFAULT_WORDS);
  const [pmAnswer, setPmAnswer] = useState(DEFAULT_PM);
  const [step, setStep] = useState(0);
  const [scores, setScores] = useState({}); // { itemId: boolean[] }
  const [notes, setNotes] = useState("");
  const [startTime, setStartTime] = useState(null); // เริ่มจับเวลาเมื่อเข้าสู่ข้อ 1
  const [elapsed, setElapsed] = useState(0); // วินาที
  const beepedRef = useRef(false);
  const [faceImages, setFaceImages] = useState({
    happy: null,
    angry: null,
    thinking: null,
  });

  // โหลดรูปใบหน้าที่เคยบันทึกไว้ (ถ้ามี)
  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get("screening:faceImages");
        if (r && r.value) setFaceImages(JSON.parse(r.value));
      } catch (e) {
        /* ยังไม่มีรูปที่บันทึกไว้ ใช้ภาพวาดเป็นค่าเริ่มต้น */
      }
    })();
  }, []);

  const updateFace = async (emotion, dataUrl) => {
    const next = { ...faceImages, [emotion]: dataUrl };
    setFaceImages(next);
    try {
      await window.storage.set("screening:faceImages", JSON.stringify(next));
    } catch (e) {
      /* บันทึกถาวรไม่ได้ แต่ยังใช้ได้ในเซสชันนี้ */
    }
  };

  // จับเวลาขณะทำแบบทดสอบ
  useEffect(() => {
    if (startTime == null || screen !== "test") return;
    const id = setInterval(
      () => setElapsed(Math.floor((Date.now() - startTime) / 1000)),
      1000
    );
    return () => clearInterval(id);
  }, [startTime, screen]);

  // เสียงเตือนเบา ๆ เมื่อครบ 3 นาที (เข้าช่วงถามข้อจำคำ)
  useEffect(() => {
    if (elapsed >= 180 && !beepedRef.current) {
      beepedRef.current = true;
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        const ctx = new Ctx();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "sine";
        o.frequency.value = 660;
        g.gain.value = 0.06;
        o.connect(g);
        g.connect(ctx.destination);
        o.start();
        setTimeout(() => {
          o.stop();
          ctx.close();
        }, 320);
      } catch (e) {
        /* เล่นเสียงไม่ได้ ไม่เป็นไร */
      }
    }
  }, [elapsed]);

  const items = useMemo(() => buildItems(wordSet, pmAnswer), [wordSet, pmAnswer]);

  const todayTH = useMemo(() => {
    try {
      return new Date().toLocaleDateString("th-TH-u-ca-buddhist", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return new Date().toLocaleDateString();
    }
  }, []);

  const getChecked = (item) =>
    scores[item.id] || new Array(item.parts.length).fill(false);

  const itemScore = (item) =>
    getChecked(item).reduce((s, c, i) => s + (c ? item.parts[i].pts : 0), 0);

  const toggle = (item, idx) => {
    const cur = getChecked(item).slice();
    cur[idx] = !cur[idx];
    setScores({ ...scores, [item.id]: cur });
  };

  const total = useMemo(
    () => items.reduce((s, it) => s + itemScore(it), 0),
    [items, scores]
  );

  const domainResults = useMemo(() => {
    const res = {};
    Object.keys(DOMAINS).forEach((k) => (res[k] = { got: 0, max: 0 }));
    items.forEach((it) => {
      const max = it.parts.reduce((s, p) => s + p.pts, 0);
      res[it.domain].got += itemScore(it);
      res[it.domain].max += max;
    });
    Object.keys(res).forEach((k) => {
      const r = res[k];
      r.pct = r.max ? Math.round((r.got / r.max) * 100) : 0;
      r.status = statusFromPct(r.pct);
    });
    return res;
  }, [items, scores]);

  const regionStatus = useMemo(() => {
    const avg = (keys) => {
      const vals = keys.map((k) => domainResults[k].pct);
      return statusFromPct(vals.reduce((a, b) => a + b, 0) / vals.length);
    };
    return {
      frontal: avg(["attention", "executive", "social"]),
      parietal: domainResults.visuospatial.status,
      temporal: avg(["language", "social"]),
      hippocampus: domainResults.memory.status,
    };
  }, [domainResults]);

  const reset = () => {
    setScreen("intro");
    setPatient({ name: "", age: "" });
    setWordSet(DEFAULT_WORDS);
    setPmAnswer(DEFAULT_PM);
    setStep(0);
    setScores({});
    setNotes("");
    setStartTime(null);
    setElapsed(0);
    beepedRef.current = false;
    // ไม่ล้าง faceImages เพราะเป็นการตั้งค่าระดับเครื่อง ใช้ซ้ำได้
  };

  return (
    <div
      style={{ background: C.paper, color: C.ink, minHeight: "100vh" }}
      className="w-full"
    >
      <div className="mx-auto max-w-3xl px-4 py-6 md:py-8">
        <Header />
        {screen === "intro" && (
          <Intro
            patient={patient}
            setPatient={setPatient}
            wordSet={wordSet}
            setWordSet={setWordSet}
            pmAnswer={pmAnswer}
            setPmAnswer={setPmAnswer}
            faceImages={faceImages}
            updateFace={updateFace}
            onStart={() => setScreen("register")}
          />
        )}
        {screen === "register" && (
          <Register
            wordSet={wordSet}
            onBack={() => setScreen("intro")}
            onStart={() => {
              setStep(0);
              setElapsed(0);
              beepedRef.current = false;
              setStartTime(Date.now());
              setScreen("test");
            }}
          />
        )}
        {screen === "test" && (
          <Test
            items={items}
            step={step}
            setStep={setStep}
            getChecked={getChecked}
            itemScore={itemScore}
            toggle={toggle}
            todayTH={todayTH}
            pmAnswer={pmAnswer}
            setPmAnswer={setPmAnswer}
            faceImages={faceImages}
            elapsed={elapsed}
            onFinish={() => setScreen("results")}
          />
        )}
        {screen === "results" && (
          <Results
            patient={patient}
            total={total}
            domainResults={domainResults}
            regionStatus={regionStatus}
            notes={notes}
            setNotes={setNotes}
            onReset={reset}
            onBack={() => {
              setStep(items.length - 1);
              setScreen("test");
            }}
          />
        )}
        <Disclaimer />
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className="mb-6 flex items-center gap-3">
      <div
        className="flex h-11 w-11 items-center justify-center rounded-2xl"
        style={{ background: C.primary }}
      >
        <Brain size={24} color="#fff" />
      </div>
      <div>
        <h1 className="text-lg font-bold leading-tight" style={{ color: C.primaryDeep }}>
          แบบทดสอบสภาพสมองเบื้องต้น
        </h1>
        <p className="text-xs" style={{ color: C.muted }}>
          เครื่องมือคัดกรองเชิงโดเมน · แปลผลตามตำแหน่งสมอง · 30 คะแนน
        </p>
      </div>
    </div>
  );
}

/* ----------------------------- Intro ----------------------------- */
function Intro({
  patient,
  setPatient,
  wordSet,
  setWordSet,
  pmAnswer,
  setPmAnswer,
  faceImages,
  updateFace,
  onStart,
}) {
  const ready = patient.name.trim() && patient.age.toString().trim();
  return (
    <div className="space-y-5">
      <Card>
        <SectionTitle icon={<Info size={16} />}>เกี่ยวกับแบบทดสอบนี้</SectionTitle>
        <p className="text-sm leading-relaxed" style={{ color: C.inkSoft }}>
          แบบทดสอบครอบคลุม 6 โดเมนปัญญา ได้แก่ ความจำ สมาธิ ภาษา มิติสัมพันธ์
          การบริหารจัดการ และการรับรู้อารมณ์ คะแนนแต่ละข้อจะถูกแปลกลับไปยังตำแหน่งสมอง
          ที่น่าจะเกี่ยวข้อง เพื่อช่วยชี้แนวทางว่าควรประเมินสมองส่วนใดต่อ
        </p>
      </Card>

      <Card>
        <SectionTitle icon={<User size={16} />}>ข้อมูลผู้รับการทดสอบ</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="ชื่อ-นามสกุล">
            <input
              value={patient.name}
              onChange={(e) => setPatient({ ...patient, name: e.target.value })}
              placeholder="กรอกชื่อ-นามสกุล"
              className="w-full rounded-xl px-3 py-2 text-sm outline-none"
              style={{ border: `1px solid ${C.line}`, background: "#fff" }}
            />
          </Field>
          <Field label="อายุ (ปี)">
            <input
              value={patient.age}
              onChange={(e) =>
                setPatient({ ...patient, age: e.target.value.replace(/[^0-9]/g, "") })
              }
              placeholder="เช่น 72"
              inputMode="numeric"
              className="w-full rounded-xl px-3 py-2 text-sm outline-none"
              style={{ border: `1px solid ${C.line}`, background: "#fff" }}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <SectionTitle icon={<Lightbulb size={16} />}>ตั้งค่าก่อนเริ่ม</SectionTitle>
        <Field label="คำ 5 คำที่จะให้ผู้ป่วยจำ (ใช้ทดสอบในข้อ 10)">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {wordSet.map((w, i) => (
              <input
                key={i}
                value={w}
                onChange={(e) => {
                  const next = wordSet.slice();
                  next[i] = e.target.value;
                  setWordSet(next);
                }}
                className="w-full rounded-xl px-2 py-2 text-center text-sm outline-none"
                style={{ border: `1px solid ${C.line}`, background: "#fff" }}
              />
            ))}
          </div>
        </Field>
        <div className="mt-3">
          <Field label="เฉลยข้อ 9 — นายกรัฐมนตรีคนปัจจุบัน (แก้ไขได้)">
            <input
              value={pmAnswer}
              onChange={(e) => setPmAnswer(e.target.value)}
              className="w-full rounded-xl px-3 py-2 text-sm outline-none"
              style={{ border: `1px solid ${C.line}`, background: "#fff" }}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <SectionTitle icon={<ImagePlus size={16} />}>
          ภาพใบหน้าสำหรับข้อ 11 (การอ่านอารมณ์)
        </SectionTitle>
        <p className="mb-3 text-xs leading-relaxed" style={{ color: C.muted }}>
          อัปโหลดภาพใบหน้าที่คุณสร้างเอง (เช่น ภาพจาก AI ที่ไม่ใช่บุคคลจริง) ได้ทั้ง 3 อารมณ์
          ระบบจะจดจำรูปไว้ใช้ครั้งต่อไป หากไม่ใส่รูป จะใช้ภาพวาดเป็นค่าเริ่มต้น
        </p>
        <div className="grid grid-cols-3 gap-3">
          {[
            { key: "happy", label: "มีความสุข" },
            { key: "angry", label: "โกรธ" },
            { key: "thinking", label: "ครุ่นคิด" },
          ].map((f) => (
            <FaceUploader
              key={f.key}
              emotion={f.key}
              label={f.label}
              image={faceImages[f.key]}
              onPick={async (file) => {
                try {
                  const url = await downscaleImage(file);
                  updateFace(f.key, url);
                } catch (e) {
                  /* อ่านรูปไม่ได้ */
                }
              }}
              onClear={() => updateFace(f.key, null)}
            />
          ))}
        </div>
      </Card>

      <div className="flex justify-end">
        <PrimaryButton onClick={onStart} disabled={!ready}>
          เริ่มแบบทดสอบ <ArrowRight size={16} />
        </PrimaryButton>
      </div>
    </div>
  );
}

function FaceUploader({ emotion, label, image, onPick, onClear }) {
  const inputRef = useRef(null);
  return (
    <div
      className="flex flex-col items-center rounded-2xl p-2"
      style={{ background: "#f3f7f6", border: `1px solid ${C.line}` }}
    >
      <div
        className="overflow-hidden rounded-xl"
        style={{ width: 96, height: 112, background: "#fff" }}
      >
        {image ? (
          <img
            src={image}
            alt={label}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div style={{ transform: "scale(0.74)", transformOrigin: "top center" }}>
            <FacePortrait emotion={emotion} />
          </div>
        )}
      </div>
      <span className="mt-1 text-xs font-semibold" style={{ color: C.ink }}>
        {label}
      </span>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files && e.target.files[0];
          if (file) onPick(file);
          e.target.value = "";
        }}
      />
      <div className="mt-1 flex gap-1">
        <button
          onClick={() => inputRef.current && inputRef.current.click()}
          className="rounded-lg px-2 py-1 text-xs font-semibold"
          style={{ background: C.primary, color: "#fff" }}
        >
          {image ? "เปลี่ยน" : "อัปโหลด"}
        </button>
        {image && (
          <button
            onClick={onClear}
            className="rounded-lg px-2 py-1 text-xs font-semibold"
            style={{ background: "#fff", color: C.muted, border: `1px solid ${C.line}` }}
          >
            ลบ
          </button>
        )}
      </div>
    </div>
  );
}

/* --------------------------- Register --------------------------- */
function Register({ wordSet, onBack, onStart }) {
  return (
    <div className="space-y-5">
      <Card>
        <Pill bg="#eaf3f2" color={C.primary}>ขั้นที่ 1 · ให้คำเพื่อจดจำ</Pill>
        <h2 className="mt-3 text-base font-bold" style={{ color: C.primaryDeep }}>
          อ่านคำ 5 คำนี้ให้ผู้ป่วยฟังช้า ๆ
        </h2>
        <p className="mt-1 text-sm" style={{ color: C.inkSoft }}>
          บอกผู้ป่วยว่า “ผมจะบอกคำ 5 คำ ขอให้จำไว้ เดี๋ยวจะถามอีกครั้งตอนท้าย”
          อ่านซ้ำได้ 2–3 รอบจนผู้ป่วยพูดตามได้ครบ
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          {wordSet.map((w, i) => (
            <div
              key={i}
              className="rounded-2xl px-5 py-4 text-center"
              style={{ background: C.primary, color: "#fff", minWidth: 96 }}
            >
              <div className="text-xs opacity-80">คำที่ {i + 1}</div>
              <div className="text-lg font-bold">{w}</div>
            </div>
          ))}
        </div>
      </Card>
      <div className="flex justify-between">
        <GhostButton onClick={onBack}>
          <ArrowLeft size={16} /> ย้อนกลับ
        </GhostButton>
        <PrimaryButton onClick={onStart}>
          ผู้ป่วยจำได้แล้ว เริ่มข้อ 1 <ArrowRight size={16} />
        </PrimaryButton>
      </div>
    </div>
  );
}

/* ----------------------------- Test ----------------------------- */
function Test({
  items,
  step,
  setStep,
  getChecked,
  itemScore,
  toggle,
  todayTH,
  pmAnswer,
  setPmAnswer,
  faceImages,
  elapsed,
  onFinish,
}) {
  const item = items[step];
  const checked = getChecked(item);
  const dom = DOMAINS[item.domain];
  const max = item.parts.reduce((s, p) => s + p.pts, 0);
  const win = recallWindow(elapsed);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between text-xs" style={{ color: C.muted }}>
        <span>
          ข้อ {step + 1} จาก {items.length}
        </span>
        <span>คะแนนข้อนี้ {itemScore(item)} / {max}</span>
      </div>
      <Progress value={step + 1} max={items.length} />

      <div
        className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2"
        style={{ background: "#fff", border: `1px solid ${C.line}` }}
      >
        <div className="flex items-center gap-2">
          <Clock size={15} style={{ color: C.primary }} />
          <span className="text-sm font-semibold" style={{ color: C.ink }}>
            เวลาตั้งแต่ให้คำจำ {fmtTime(elapsed)}
          </span>
        </div>
        <span className="text-xs font-semibold" style={{ color: win.color }}>
          {win.text}
        </span>
      </div>

      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Pill bg={C.primaryDeep} color="#fff">ข้อ {item.id}</Pill>
          <Pill bg="#eaf3f2" color={C.primary}>{dom.label}</Pill>
          <span className="text-xs" style={{ color: C.muted }}>
            {dom.region}
          </span>
        </div>

        <h2 className="text-base font-bold" style={{ color: C.primaryDeep }}>
          {item.title}
        </h2>
        <p className="mt-1 text-sm leading-relaxed" style={{ color: C.inkSoft }}>
          {item.prompt}
        </p>

        {item.isRecall && (
          <div
            className="mt-3 rounded-xl px-3 py-3"
            style={{ background: "#fff", border: `2px solid ${win.color}` }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold" style={{ color: C.muted }}>
                เวลาตั้งแต่ให้คำจำ
              </span>
              <span className="text-2xl font-bold" style={{ color: win.color }}>
                {fmtTime(elapsed)}
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: C.inkSoft }}>
              {win.text} — โดยทั่วไปวัดการจำคืนที่ประมาณ 3–5 นาทีหลังเริ่มให้จดจำ
            </p>
          </div>
        )}

        {item.showToday && (
          <div
            className="mt-3 rounded-xl px-3 py-2 text-sm"
            style={{ background: "#f3f7f6", color: C.inkSoft }}
          >
            วันที่จริงสำหรับเทียบ: <strong>{todayTH}</strong>
          </div>
        )}

        {item.visual === "animals" && (
          <div className="mt-4">
            <Animals />
          </div>
        )}
        {item.visual === "faces" && (
          <div className="mt-4">
            <Faces faceImages={faceImages} />
          </div>
        )}
        {item.visual === "cubes" && (
          <div className="mt-4">
            <Cubes />
          </div>
        )}

        {item.editableAnswer && (
          <div className="mt-4">
            <Field label="เฉลยปัจจุบัน (แก้ไขได้)">
              <input
                value={pmAnswer}
                onChange={(e) => setPmAnswer(e.target.value)}
                className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                style={{ border: `1px solid ${C.line}`, background: "#fff" }}
              />
            </Field>
          </div>
        )}

        {/* scoring */}
        <div className="mt-5 space-y-2">
          <div className="text-xs font-semibold" style={{ color: C.muted }}>
            ติ๊กข้อที่ผู้ป่วยทำได้
          </div>
          {item.parts.map((p, i) => (
            <button
              key={i}
              onClick={() => toggle(item, i)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm"
              style={{
                border: `1px solid ${checked[i] ? C.primary : C.line}`,
                background: checked[i] ? "#eaf3f2" : "#fff",
              }}
            >
              <span
                className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md"
                style={{
                  background: checked[i] ? C.primary : "#fff",
                  border: `1px solid ${checked[i] ? C.primary : C.line}`,
                }}
              >
                {checked[i] && <Check size={14} color="#fff" />}
              </span>
              <span style={{ color: C.ink }}>{p.label}</span>
              <span className="ml-auto text-xs" style={{ color: C.muted }}>
                +{p.pts}
              </span>
            </button>
          ))}
        </div>

        <div
          className="mt-4 flex gap-2 rounded-xl px-3 py-2.5 text-xs leading-relaxed"
          style={{ background: "#fbf7ee", color: C.inkSoft, border: `1px solid #efe2c6` }}
        >
          <Lightbulb size={15} style={{ color: C.amber, flexShrink: 0, marginTop: 1 }} />
          <span>{item.guide}</span>
        </div>
      </Card>

      <div className="flex justify-between">
        <GhostButton onClick={() => (step === 0 ? null : setStep(step - 1))}>
          <ArrowLeft size={16} /> ก่อนหน้า
        </GhostButton>
        {step < items.length - 1 ? (
          <PrimaryButton onClick={() => setStep(step + 1)}>
            ข้อถัดไป <ArrowRight size={16} />
          </PrimaryButton>
        ) : (
          <PrimaryButton onClick={onFinish}>
            ดูผลสรุป <ArrowRight size={16} />
          </PrimaryButton>
        )}
      </div>
    </div>
  );
}

/* ---------------------------- Results ---------------------------- */
function interpret(total) {
  if (total >= 26)
    return { label: "ไม่พบความบกพร่องชัดเจน", color: C.green, key: "intact" };
  if (total >= 21)
    return { label: "สงสัยความบกพร่องเล็กน้อย", color: C.amber, key: "mild" };
  if (total >= 13)
    return { label: "ความบกพร่องระดับปานกลาง", color: C.accent, key: "mod" };
  return { label: "ความบกพร่องระดับมาก", color: C.accent, key: "severe" };
}

function Results({
  patient,
  total,
  domainResults,
  regionStatus,
  notes,
  setNotes,
  onReset,
  onBack,
}) {
  const verdict = interpret(total);
  const flagged = Object.entries(domainResults)
    .filter(([, r]) => r.status !== "intact")
    .sort((a, b) => a[1].pct - b[1].pct);

  return (
    <div className="space-y-5">
      {/* score header */}
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs" style={{ color: C.muted }}>
              {patient.name || "ไม่ระบุชื่อ"}
              {patient.age ? ` · อายุ ${patient.age} ปี` : ""}
            </div>
            <div className="mt-1 flex items-end gap-2">
              <span className="text-5xl font-bold" style={{ color: C.primaryDeep }}>
                {total}
              </span>
              <span className="pb-1.5 text-lg" style={{ color: C.muted }}>
                / {TOTAL_MAX}
              </span>
            </div>
          </div>
          <div
            className="rounded-xl px-4 py-2 text-sm font-bold"
            style={{ background: verdict.color, color: "#fff" }}
          >
            {verdict.label}
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed" style={{ color: C.muted }}>
          ช่วงคะแนนนี้เป็นเกณฑ์เบื้องต้นที่ผู้ออกแบบกำหนดเอง ยังไม่ผ่านการตรวจสอบความตรง
          ทางสถิติ ใช้เพื่อชี้แนวทางเท่านั้น ไม่ใช่การวินิจฉัย
        </p>
      </Card>

      {/* brain map signature */}
      <Card>
        <SectionTitle icon={<Brain size={16} />}>แผนที่ตำแหน่งสมอง</SectionTitle>
        <div className="flex flex-col items-center gap-4 md:flex-row md:items-start">
          <div className="flex-shrink-0">
            <BrainMap regionStatus={regionStatus} />
          </div>
          <div className="w-full space-y-2">
            <Legend />
            <RegionRow name="กลีบหน้า (วางแผน/สมาธิ/อารมณ์)" status={regionStatus.frontal} />
            <RegionRow name="กลีบข้าง (มิติสัมพันธ์)" status={regionStatus.parietal} />
            <RegionRow name="กลีบขมับ (ภาษา/ความหมาย)" status={regionStatus.temporal} />
            <RegionRow name="ฮิปโปแคมปัส (ความจำใหม่)" status={regionStatus.hippocampus} />
          </div>
        </div>
      </Card>

      {/* domain bars */}
      <Card>
        <SectionTitle icon={<ClipboardList size={16} />}>คะแนนรายโดเมน</SectionTitle>
        <div className="space-y-3">
          {Object.entries(DOMAINS).map(([k, d]) => {
            const r = domainResults[k];
            const s = STATUS[r.status];
            return (
              <div key={k}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span style={{ color: C.ink }}>{d.label}</span>
                  <span style={{ color: C.muted }}>
                    {r.got}/{r.max}
                  </span>
                </div>
                <div className="h-2.5 w-full rounded-full" style={{ background: C.line }}>
                  <div
                    className="h-2.5 rounded-full"
                    style={{ width: `${r.pct}%`, background: s.color }}
                  />
                </div>
                <div className="mt-0.5 text-xs" style={{ color: C.muted }}>
                  {d.region} · {d.regionEn}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* interpretation of flagged domains */}
      <Card>
        <SectionTitle icon={<AlertTriangle size={16} />}>โดเมนที่ควรให้ความสนใจ</SectionTitle>
        {flagged.length === 0 ? (
          <p className="text-sm" style={{ color: C.inkSoft }}>
            ทุกโดเมนอยู่ในเกณฑ์ปกติ ไม่พบความบกพร่องเด่นชัด
          </p>
        ) : (
          <div className="space-y-3">
            {flagged.map(([k]) => {
              const d = DOMAINS[k];
              const r = domainResults[k];
              return (
                <div
                  key={k}
                  className="rounded-xl px-3 py-2.5"
                  style={{ background: "#fdf3f0", border: `1px solid #f1d3cb` }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold" style={{ color: C.ink }}>
                      {d.label}
                    </span>
                    <Pill bg={STATUS[r.status].color} color="#fff">
                      {r.pct}%
                    </Pill>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed" style={{ color: C.inkSoft }}>
                    เกี่ยวข้องกับ {d.region} — {d.note}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* notes */}
      <Card>
        <SectionTitle icon={<ClipboardList size={16} />}>บันทึกเพิ่มเติมของผู้ตรวจ</SectionTitle>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="ข้อสังเกต พฤติกรรม ปัจจัยรบกวน (การได้ยิน สายตา การศึกษา ภาวะซึมเศร้า ฯลฯ)"
          className="w-full rounded-xl px-3 py-2 text-sm outline-none"
          style={{ border: `1px solid ${C.line}`, background: "#fff" }}
        />
      </Card>

      <div className="flex flex-wrap justify-between gap-2">
        <GhostButton onClick={onBack}>
          <ArrowLeft size={16} /> กลับไปแก้คะแนน
        </GhostButton>
        <div className="flex gap-2">
          <GhostButton onClick={() => window.print()}>
            <Printer size={16} /> พิมพ์ผล
          </GhostButton>
          <PrimaryButton onClick={onReset}>
            <RotateCcw size={16} /> เริ่มผู้ป่วยใหม่
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

function RegionRow({ name, status }) {
  const s = STATUS[status];
  return (
    <div className="flex items-center gap-2 text-sm">
      <span
        className="h-3 w-3 flex-shrink-0 rounded-full"
        style={{ background: s.color }}
      />
      <span style={{ color: C.ink }}>{name}</span>
      <span className="ml-auto text-xs" style={{ color: C.muted }}>
        {s.label}
      </span>
    </div>
  );
}

function Legend() {
  return (
    <div className="mb-1 flex flex-wrap gap-3 text-xs" style={{ color: C.muted }}>
      {["intact", "borderline", "concern"].map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS[k].color }} />
          {STATUS[k].label}
        </span>
      ))}
    </div>
  );
}

/* --------------------------- primitives --------------------------- */
function Card({ children }) {
  return (
    <div
      className="rounded-2xl p-4 md:p-5"
      style={{ background: C.card, border: `1px solid ${C.line}` }}
    >
      {children}
    </div>
  );
}

function SectionTitle({ icon, children }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span style={{ color: C.primary }}>{icon}</span>
      <h3 className="text-sm font-bold" style={{ color: C.primaryDeep }}>
        {children}
      </h3>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold" style={{ color: C.muted }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function Disclaimer() {
  return (
    <div
      className="mt-6 flex gap-2 rounded-xl px-3 py-3 text-xs leading-relaxed"
      style={{ background: "#fff", border: `1px solid ${C.line}`, color: C.muted }}
    >
      <AlertTriangle size={15} style={{ color: C.amber, flexShrink: 0, marginTop: 1 }} />
      <span>
        เครื่องมือนี้เป็นแบบคัดกรองเชิงชี้แนะที่ออกแบบขึ้นเอง ยังไม่ผ่านการตรวจสอบความตรง
        และความเที่ยงทางสถิติ การแปลผลตำแหน่งสมองเป็นการประมาณเชิงการศึกษา ไม่ใช่การวินิจฉัย
        ผลควรพิจารณาร่วมกับประวัติ การตรวจร่างกาย เครื่องมือมาตรฐาน (เช่น MoCA, MMSE/TMSE)
        ปัจจัยรบกวน (ระดับการศึกษา ภาษา การได้ยิน-สายตา ภาวะซึมเศร้า เพ้อสับสน ยา) และการประเมิน
        โดยแพทย์ผู้เชี่ยวชาญเสมอ
      </span>
    </div>
  );
}
