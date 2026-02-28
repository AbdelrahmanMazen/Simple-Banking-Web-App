export type AdminAnnouncement = {
  id: number;
  title: string;
  titleAr: string | null;
  body: string | null;
  bodyAr: string | null;
  mediaUrl: string | null;
  youtubeId: string | null;
  startsAt: Date;
  endsAt: Date | null;
  status: "DRAFT" | "SCHEDULED" | "ACTIVE" | "EXPIRED" | "CANCELLED";
  createdAt: Date;
  updatedAt: Date;
};
