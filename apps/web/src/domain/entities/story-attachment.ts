export type StoryAttachment = {
  __typename: "StoryAttachment";
  id: string;
  storyId: string;
  fileName: string;
  fileKey: string;
  mimeType: string;
  fileSize: number;
  uploadedBy: string;
  createdAt: string;
};

export function isImageAttachment(attachment: StoryAttachment): boolean {
  return attachment.mimeType.startsWith("image/");
}
