import { HiqStorage } from "./hiqStorage.js";
import { searchUsers, getRecentOpponents } from "./hiqSearchHelpers.js";

export const storage = new HiqStorage();

// Export standalone helper functions
export { searchUsers, getRecentOpponents };
