import { Story } from "../entities/story";

export const normalizeTitle = (story: Story) => story.title.trim();
