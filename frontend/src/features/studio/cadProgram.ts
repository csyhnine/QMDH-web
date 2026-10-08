import type { CadExtractData } from "../../api";

type Floor = NonNullable<NonNullable<CadExtractData["spaces"]>["floors"]>[number];
type Room = NonNullable<Floor["rooms"]>[number];

export type ProgramTone = "warning" | "ok" | "info" | "muted";

export type ProgramItem = {
  roomId: string;
  floorIndex: number;
  floorLabel: string;
  marker: string;
  name: string;
  areaM2: number;
  arrangement: string;
  contents: string;
  verdict: string;
  tone: ProgramTone;
};

const GENERIC_NAMES = new Set(["待分区", "新分区", "辅助用房", "接待或开放办公", "办公或会议"]);

function listedRooms(floor: Floor): Room[] {
  return [...(floor.rooms ?? [])]
    .filter((room) => room.area_ratio >= 0.005 || room.function_source === "edited")
    .sort((left, right) => (right.area_m2 || 0) - (left.area_m2 || 0));
}

function roomName(room: Room): string {
  return (room.proposal || room.function || room.zoning?.role || "待分区").trim() || "待分区";
}

function areaOf(room: Room): number {
  return typeof room.area_m2 === "number" && room.area_m2 > 0 ? room.area_m2 : 0;
}

function isGeneric(name: string): boolean {
  return !name || GENERIC_NAMES.has(name) || name.includes("先隔卫生间");
}

function countText(area: number, perPerson: number): number {
  return Math.max(1, Math.round(area / perPerson));
}

function namedArrangement(room: Room, name: string, area: number): Omit<ProgramItem, "roomId" | "floorIndex" | "floorLabel" | "marker" | "name" | "areaM2"> | null {
  if (name.includes("咖啡") || name.includes("茶座")) {
    return {
      arrangement: "居民休息茶座",
      contents: `保留「${name}」这个名字。散座大约 ${countText(area, 3)} 座，加一个备餐台。不做封闭后厨。`,
      verdict: area >= 40 ? "休息够，后厨不够" : "座位偏紧",
      tone: "info",
    };
  }
  if (name.includes("调解")) {
    return {
      arrangement: "调解室",
      contents: "按你定的名称单独使用。放一张谈话桌和几把椅子。",
      verdict: area >= 12 ? "够一间谈话" : "偏小",
      tone: area >= 12 ? "ok" : "warning",
    };
  }
  if (name.includes("学习")) {
    return {
      arrangement: "学习区",
      contents: `安静阅读大约 ${countText(area, 5)} 座，少量内部桌位，档案柜靠墙。这间若是入口，桌椅不要堵门。不做封闭档案库。`,
      verdict: area >= 40 ? "够安静使用" : "偏小",
      tone: "info",
    };
  }
  if (name.includes("舞蹈") || name.includes("运动") || name.includes("青少年")) {
    return {
      arrangement: "青少年活动室",
      contents: `中间留空，做舞蹈或轻活动，大约 ${countText(area, 5)} 人。不放固定工位，不做球类场地。`,
      verdict: area >= 60 ? "够舞蹈或轻活动" : "偏小",
      tone: area >= 60 ? "ok" : "warning",
    };
  }
  if (name.includes("档案")) {
    return {
      arrangement: area >= 40 ? "档案与内部办公" : "档案",
      contents: area >= 40 ? "靠墙档案柜，其余做内部桌位。现在仍是一间，档案不单独成库。" : "按现有边界做档案存放。",
      verdict: area >= 40 ? "合用可以" : "只够存放",
      tone: "info",
    };
  }
  if (name.includes("会议")) {
    return {
      arrangement: "会议室",
      contents: `一张大约 ${countText(area, 3.5)} 人的会议桌。这间不再兼作办公。`,
      verdict: area >= 40 ? "够一间会议" : "偏小",
      tone: area >= 40 ? "ok" : "warning",
    };
  }
  if (name.includes("活动") || name.includes("党建")) {
    return {
      arrangement: "党建与居民活动",
      contents: `活动椅，大约 ${countText(area, 3.3)} 人集合。不设封闭工位。`,
      verdict: area >= 60 ? "够活动" : "人数要收一收",
      tone: area >= 60 ? "ok" : "warning",
    };
  }
  if ((name.includes("卫生间") || room.function === "卫生间") && area > 0 && area <= 25) {
    return {
      arrangement: "卫生间",
      contents: "按现有边界做卫生间，坐便和洗手。",
      verdict: area >= 6 ? "够一间卫生间" : "偏小",
      tone: area >= 6 ? "ok" : "warning",
    };
  }
  if (name.includes("储藏") || name.includes("库房")) {
    return {
      arrangement: "储藏",
      contents: "货架。放不下一张办公桌。",
      verdict: "只够储藏",
      tone: "muted",
    };
  }
  return null;
}

function genericArrangement(room: Room, floorIndex: number, area: number, role: "office" | "meeting" | "activity" | "archive" | "storage" | "reception"): Omit<ProgramItem, "roomId" | "floorIndex" | "floorLabel" | "marker" | "name" | "areaM2"> {
  const embeddedToilet = floorIndex === 1 && area > 25 && (room.zoning?.hygiene === "污" || roomName(room).includes("卫生间") || room.function === "卫生间");
  if (embeddedToilet || role === "reception") {
    return {
      arrangement: "先隔卫生间，其余做一站式接待",
      contents: "隔出约 8–12㎡ 卫生间（坐便、洗手）。其余做服务台、等候座、填表台。隔出来之前，不要把整间都当成接待面积。",
      verdict: "隔开后接待够用",
      tone: "warning",
    };
  }
  if (role === "storage" || (area > 0 && area < 12)) {
    return {
      arrangement: "储藏",
      contents: "货架。放不下一张办公桌。没有卫生间图层时，不把这间当成卫生间。",
      verdict: "只够储藏",
      tone: "muted",
    };
  }
  if (role === "office") {
    return {
      arrangement: "职工开放办公",
      contents: `按约 8㎡/人估算，大约 ${countText(area, 8)} 个工位。不另设接待台，接待留在入口那间。`,
      verdict: "够",
      tone: "ok",
    };
  }
  if (role === "meeting") {
    return {
      arrangement: "会议室",
      contents: `一张大约 ${countText(area, 3.5)} 人的会议桌。这间不再兼作办公。`,
      verdict: "够一间会议",
      tone: "ok",
    };
  }
  if (role === "activity") {
    return {
      arrangement: "党建与居民活动",
      contents: `这间有入口。活动椅，大约 ${countText(area, 3.3)} 人集合。不设封闭工位。`,
      verdict: "够活动",
      tone: "ok",
    };
  }
  return {
    arrangement: "档案与内部办公",
    contents: "靠墙档案柜，其余做内部桌位。现在是一间，档案不单独成库。",
    verdict: "合用可以",
    tone: "info",
  };
}

function assignGeneric(floor: Floor, rooms: Room[]): Map<string, "office" | "meeting" | "activity" | "archive" | "storage" | "reception"> {
  const roles = new Map<string, "office" | "meeting" | "activity" | "archive" | "storage" | "reception">();
  const pending = rooms.filter((room) => isGeneric(roomName(room)) && namedArrangement(room, roomName(room), areaOf(room)) == null);
  if (floor.floor_index === 1) {
    const reception = pending.find(
      (room) => areaOf(room) > 25 && (room.zoning?.hygiene === "污" || roomName(room).includes("卫生间") || room.function === "卫生间"),
    );
    if (reception) roles.set(reception.room_id, "reception");
    const office = pending
      .filter((room) => !roles.has(room.room_id) && areaOf(room) >= 100)
      .sort((left, right) => areaOf(right) - areaOf(left))[0];
    if (office) roles.set(office.room_id, "office");
    const meeting = pending
      .filter((room) => !roles.has(room.room_id) && areaOf(room) >= 40 && areaOf(room) < 100)
      .sort((left, right) => areaOf(right) - areaOf(left))[0];
    if (meeting) roles.set(meeting.room_id, "meeting");
  } else {
    const activity = pending.find((room) => room.entrance && areaOf(room) >= 50) ?? pending.find((room) => areaOf(room) >= 80);
    if (activity && areaOf(activity) >= 50) roles.set(activity.room_id, "activity");
    const archive = pending
      .filter((room) => !roles.has(room.room_id) && areaOf(room) >= 50)
      .sort((left, right) => areaOf(right) - areaOf(left))[0];
    if (archive) roles.set(archive.room_id, "archive");
  }
  for (const room of pending) {
    if (!roles.has(room.room_id) && areaOf(room) > 0 && areaOf(room) < 12) roles.set(room.room_id, "storage");
  }
  return roles;
}

export function buildCadProgram(floors: Floor[]): { items: ProgramItem[]; gaps: string[] } {
  const items: ProgramItem[] = [];
  for (const floor of floors) {
    const rooms = listedRooms(floor);
    const roles = assignGeneric(floor, rooms);
    for (const room of rooms) {
      const name = roomName(room);
      const area = areaOf(room);
      const named = namedArrangement(room, name, area);
      const role = roles.get(room.room_id);
      const body =
        named ??
        (role
          ? genericArrangement(room, floor.floor_index, area, role)
          : {
              arrangement: `按「${name}」使用`,
              contents: "名称已经由你改定。这里不另起一套功能，等审查意见再改。",
              verdict: "待确认",
              tone: "muted" as const,
            });
      items.push({
        roomId: room.room_id,
        floorIndex: floor.floor_index,
        floorLabel: floor.label,
        marker: room.marker || "",
        name,
        areaM2: area,
        ...body,
      });
    }
  }

  const gaps: string[] = [];
  const anchors = floors.flatMap((floor) => floor.anchors ?? []);
  const hasVertical = anchors.some((anchor) => anchor.label === "楼梯" || anchor.label === "电梯");
  if (!hasVertical && floors.length > 1) {
    gaps.push("两层之间没有识别到楼梯或电梯，所以没有做上下层对应，两层各自成套。");
  }
  if (!items.some((item) => item.arrangement.includes("调解"))) {
    gaps.push("独立的调解室还没有自己的房间。若要单列，用「新建分区」圈出来，再把功能改成调解室。");
  }
  if (items.some((item) => item.arrangement.includes("档案与内部办公"))) {
    gaps.push("封闭档案库还没有单独成间。若要分开，从档案与内部办公那间里再圈一块。");
  }
  const upper = floors.filter((floor) => floor.floor_index > 1);
  const upperHasToilet = upper.some((floor) =>
    (floor.rooms ?? []).some((room) => room.function === "卫生间" || (room.proposal || "").includes("卫生间") || room.zoning?.hygiene === "污"),
  );
  if (upper.length > 0 && !upperHasToilet) {
    const hasStorage = items.some((item) => item.floorIndex > 1 && item.arrangement === "储藏");
    gaps.push(hasStorage ? "二层没有识别到卫生间。面积只有几平方米的房间只作储藏。" : "二层没有识别到卫生间。");
  }
  gaps.push("人数、工位和座位数是按面积估算的布置容量，不是规范条文。家具等审查意见定下来再摆。");
  return { items, gaps };
}
