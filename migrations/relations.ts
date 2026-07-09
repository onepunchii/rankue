import { relations } from "drizzle-orm/relations";
import { hiqGames, hiqGameHistory, hiqMembers, hiqStores, profiles, hiqVisitLogs, hiqSimRecords, hiqLeaderboard, hiqFriendships, hiqClubMembers, hiqInvites, hiqTournamentParticipants, hiqTournaments, hiqCrewComments, hiqCrewPosts, hiqCrews, hiqCrewChats, hiqCrewActivities, hiqCrewActivityParticipants, hiqCrewPhotoLikes, hiqCrewPhotos, hiqCrewPhotoComments, hiqCrewMembers, hiqCrewLikes, hiqSettlementItems, hiqSettlementParticipants, hiqSettlements, golfMatchSessions, hiqNotifications, golfClubs, golfClubCourses, rankueGolfClubs, rankueGolfCourses } from "./schema";

export const hiqGameHistoryRelations = relations(hiqGameHistory, ({one}) => ({
	hiqGame: one(hiqGames, {
		fields: [hiqGameHistory.gameId],
		references: [hiqGames.id]
	}),
	hiqMember: one(hiqMembers, {
		fields: [hiqGameHistory.memberId],
		references: [hiqMembers.id]
	}),
	hiqStore: one(hiqStores, {
		fields: [hiqGameHistory.storeId],
		references: [hiqStores.id]
	}),
}));

export const hiqGamesRelations = relations(hiqGames, ({one, many}) => ({
	hiqGameHistories: many(hiqGameHistory),
	hiqMember_player1Id: one(hiqMembers, {
		fields: [hiqGames.player1Id],
		references: [hiqMembers.id],
		relationName: "hiqGames_player1Id_hiqMembers_id"
	}),
	hiqMember_player2Id: one(hiqMembers, {
		fields: [hiqGames.player2Id],
		references: [hiqMembers.id],
		relationName: "hiqGames_player2Id_hiqMembers_id"
	}),
	hiqMember_player3Id: one(hiqMembers, {
		fields: [hiqGames.player3Id],
		references: [hiqMembers.id],
		relationName: "hiqGames_player3Id_hiqMembers_id"
	}),
	hiqMember_player4Id: one(hiqMembers, {
		fields: [hiqGames.player4Id],
		references: [hiqMembers.id],
		relationName: "hiqGames_player4Id_hiqMembers_id"
	}),
	hiqStore: one(hiqStores, {
		fields: [hiqGames.storeId],
		references: [hiqStores.id]
	}),
	hiqMember_winnerId: one(hiqMembers, {
		fields: [hiqGames.winnerId],
		references: [hiqMembers.id],
		relationName: "hiqGames_winnerId_hiqMembers_id"
	}),
}));

export const hiqMembersRelations = relations(hiqMembers, ({one, many}) => ({
	hiqGameHistories: many(hiqGameHistory),
	profile: one(profiles, {
		fields: [hiqMembers.profileId],
		references: [profiles.id]
	}),
	hiqStore: one(hiqStores, {
		fields: [hiqMembers.storeId],
		references: [hiqStores.id]
	}),
	hiqVisitLogs: many(hiqVisitLogs),
	hiqSimRecords: many(hiqSimRecords),
	hiqLeaderboards: many(hiqLeaderboard),
	hiqFriendships_receiverId: many(hiqFriendships, {
		relationName: "hiqFriendships_receiverId_hiqMembers_id"
	}),
	hiqFriendships_requesterId: many(hiqFriendships, {
		relationName: "hiqFriendships_requesterId_hiqMembers_id"
	}),
	hiqClubMembers: many(hiqClubMembers),
	hiqInvites_guestId: many(hiqInvites, {
		relationName: "hiqInvites_guestId_hiqMembers_id"
	}),
	hiqInvites_hostId: many(hiqInvites, {
		relationName: "hiqInvites_hostId_hiqMembers_id"
	}),
	hiqTournamentParticipants: many(hiqTournamentParticipants),
	hiqCrewComments: many(hiqCrewComments),
	hiqCrewChats: many(hiqCrewChats),
	hiqCrewActivities: many(hiqCrewActivities),
	hiqCrewActivityParticipants: many(hiqCrewActivityParticipants),
	hiqCrewPhotoLikes: many(hiqCrewPhotoLikes),
	hiqCrewPhotos: many(hiqCrewPhotos),
	hiqCrewPhotoComments: many(hiqCrewPhotoComments),
	hiqGames_player1Id: many(hiqGames, {
		relationName: "hiqGames_player1Id_hiqMembers_id"
	}),
	hiqGames_player2Id: many(hiqGames, {
		relationName: "hiqGames_player2Id_hiqMembers_id"
	}),
	hiqGames_player3Id: many(hiqGames, {
		relationName: "hiqGames_player3Id_hiqMembers_id"
	}),
	hiqGames_player4Id: many(hiqGames, {
		relationName: "hiqGames_player4Id_hiqMembers_id"
	}),
	hiqGames_winnerId: many(hiqGames, {
		relationName: "hiqGames_winnerId_hiqMembers_id"
	}),
	hiqCrewPosts: many(hiqCrewPosts),
	hiqCrewMembers: many(hiqCrewMembers),
	hiqCrewLikes: many(hiqCrewLikes),
	hiqSettlementParticipants: many(hiqSettlementParticipants),
	hiqSettlements: many(hiqSettlements),
	hiqSettlementItems: many(hiqSettlementItems),
	hiqCrews: many(hiqCrews),
	golfMatchSessions: many(golfMatchSessions),
	hiqNotifications: many(hiqNotifications),
}));

export const hiqStoresRelations = relations(hiqStores, ({one, many}) => ({
	hiqGameHistories: many(hiqGameHistory),
	hiqMembers: many(hiqMembers),
	hiqVisitLogs: many(hiqVisitLogs),
	hiqClubMembers: many(hiqClubMembers),
	profile: one(profiles, {
		fields: [hiqStores.ownerId],
		references: [profiles.id]
	}),
	hiqTournaments: many(hiqTournaments),
	hiqCrewActivities: many(hiqCrewActivities),
	hiqGames: many(hiqGames),
	hiqCrews: many(hiqCrews),
}));

export const profilesRelations = relations(profiles, ({many}) => ({
	hiqMembers: many(hiqMembers),
	hiqStores: many(hiqStores),
}));

export const hiqVisitLogsRelations = relations(hiqVisitLogs, ({one}) => ({
	hiqMember: one(hiqMembers, {
		fields: [hiqVisitLogs.memberId],
		references: [hiqMembers.id]
	}),
	hiqStore: one(hiqStores, {
		fields: [hiqVisitLogs.storeId],
		references: [hiqStores.id]
	}),
}));

export const hiqSimRecordsRelations = relations(hiqSimRecords, ({one}) => ({
	hiqMember: one(hiqMembers, {
		fields: [hiqSimRecords.memberId],
		references: [hiqMembers.id]
	}),
}));

export const hiqLeaderboardRelations = relations(hiqLeaderboard, ({one}) => ({
	hiqMember: one(hiqMembers, {
		fields: [hiqLeaderboard.memberId],
		references: [hiqMembers.id]
	}),
}));

export const hiqFriendshipsRelations = relations(hiqFriendships, ({one}) => ({
	hiqMember_receiverId: one(hiqMembers, {
		fields: [hiqFriendships.receiverId],
		references: [hiqMembers.id],
		relationName: "hiqFriendships_receiverId_hiqMembers_id"
	}),
	hiqMember_requesterId: one(hiqMembers, {
		fields: [hiqFriendships.requesterId],
		references: [hiqMembers.id],
		relationName: "hiqFriendships_requesterId_hiqMembers_id"
	}),
}));

export const hiqClubMembersRelations = relations(hiqClubMembers, ({one}) => ({
	hiqMember: one(hiqMembers, {
		fields: [hiqClubMembers.memberId],
		references: [hiqMembers.id]
	}),
	hiqStore: one(hiqStores, {
		fields: [hiqClubMembers.storeId],
		references: [hiqStores.id]
	}),
}));

export const hiqInvitesRelations = relations(hiqInvites, ({one}) => ({
	hiqMember_guestId: one(hiqMembers, {
		fields: [hiqInvites.guestId],
		references: [hiqMembers.id],
		relationName: "hiqInvites_guestId_hiqMembers_id"
	}),
	hiqMember_hostId: one(hiqMembers, {
		fields: [hiqInvites.hostId],
		references: [hiqMembers.id],
		relationName: "hiqInvites_hostId_hiqMembers_id"
	}),
}));

export const hiqTournamentParticipantsRelations = relations(hiqTournamentParticipants, ({one}) => ({
	hiqMember: one(hiqMembers, {
		fields: [hiqTournamentParticipants.memberId],
		references: [hiqMembers.id]
	}),
	hiqTournament: one(hiqTournaments, {
		fields: [hiqTournamentParticipants.tournamentId],
		references: [hiqTournaments.id]
	}),
}));

export const hiqTournamentsRelations = relations(hiqTournaments, ({one, many}) => ({
	hiqTournamentParticipants: many(hiqTournamentParticipants),
	hiqStore: one(hiqStores, {
		fields: [hiqTournaments.storeId],
		references: [hiqStores.id]
	}),
}));

export const hiqCrewCommentsRelations = relations(hiqCrewComments, ({one}) => ({
	hiqMember: one(hiqMembers, {
		fields: [hiqCrewComments.authorId],
		references: [hiqMembers.id]
	}),
	hiqCrewPost: one(hiqCrewPosts, {
		fields: [hiqCrewComments.postId],
		references: [hiqCrewPosts.id]
	}),
}));

export const hiqCrewPostsRelations = relations(hiqCrewPosts, ({one, many}) => ({
	hiqCrewComments: many(hiqCrewComments),
	hiqMember: one(hiqMembers, {
		fields: [hiqCrewPosts.authorId],
		references: [hiqMembers.id]
	}),
	hiqCrew: one(hiqCrews, {
		fields: [hiqCrewPosts.crewId],
		references: [hiqCrews.id]
	}),
	hiqCrewLikes: many(hiqCrewLikes),
}));

export const hiqCrewChatsRelations = relations(hiqCrewChats, ({one}) => ({
	hiqCrew: one(hiqCrews, {
		fields: [hiqCrewChats.crewId],
		references: [hiqCrews.id]
	}),
	hiqMember: one(hiqMembers, {
		fields: [hiqCrewChats.senderId],
		references: [hiqMembers.id]
	}),
}));

export const hiqCrewsRelations = relations(hiqCrews, ({one, many}) => ({
	hiqCrewChats: many(hiqCrewChats),
	hiqCrewActivities: many(hiqCrewActivities),
	hiqCrewPhotos: many(hiqCrewPhotos),
	hiqCrewPosts: many(hiqCrewPosts),
	hiqCrewMembers: many(hiqCrewMembers),
	hiqSettlements: many(hiqSettlements),
	hiqStore: one(hiqStores, {
		fields: [hiqCrews.baseStoreId],
		references: [hiqStores.id]
	}),
	hiqMember: one(hiqMembers, {
		fields: [hiqCrews.leaderId],
		references: [hiqMembers.id]
	}),
}));

export const hiqCrewActivitiesRelations = relations(hiqCrewActivities, ({one, many}) => ({
	hiqMember: one(hiqMembers, {
		fields: [hiqCrewActivities.creatorId],
		references: [hiqMembers.id]
	}),
	hiqCrew: one(hiqCrews, {
		fields: [hiqCrewActivities.crewId],
		references: [hiqCrews.id]
	}),
	hiqStore: one(hiqStores, {
		fields: [hiqCrewActivities.locationStoreId],
		references: [hiqStores.id]
	}),
	hiqCrewActivityParticipants: many(hiqCrewActivityParticipants),
}));

export const hiqCrewActivityParticipantsRelations = relations(hiqCrewActivityParticipants, ({one}) => ({
	hiqCrewActivity: one(hiqCrewActivities, {
		fields: [hiqCrewActivityParticipants.activityId],
		references: [hiqCrewActivities.id]
	}),
	hiqMember: one(hiqMembers, {
		fields: [hiqCrewActivityParticipants.memberId],
		references: [hiqMembers.id]
	}),
}));

export const hiqCrewPhotoLikesRelations = relations(hiqCrewPhotoLikes, ({one}) => ({
	hiqMember: one(hiqMembers, {
		fields: [hiqCrewPhotoLikes.memberId],
		references: [hiqMembers.id]
	}),
	hiqCrewPhoto: one(hiqCrewPhotos, {
		fields: [hiqCrewPhotoLikes.photoId],
		references: [hiqCrewPhotos.id]
	}),
}));

export const hiqCrewPhotosRelations = relations(hiqCrewPhotos, ({one, many}) => ({
	hiqCrewPhotoLikes: many(hiqCrewPhotoLikes),
	hiqCrew: one(hiqCrews, {
		fields: [hiqCrewPhotos.crewId],
		references: [hiqCrews.id]
	}),
	hiqMember: one(hiqMembers, {
		fields: [hiqCrewPhotos.uploaderId],
		references: [hiqMembers.id]
	}),
	hiqCrewPhotoComments: many(hiqCrewPhotoComments),
}));

export const hiqCrewPhotoCommentsRelations = relations(hiqCrewPhotoComments, ({one}) => ({
	hiqMember: one(hiqMembers, {
		fields: [hiqCrewPhotoComments.authorId],
		references: [hiqMembers.id]
	}),
	hiqCrewPhoto: one(hiqCrewPhotos, {
		fields: [hiqCrewPhotoComments.photoId],
		references: [hiqCrewPhotos.id]
	}),
}));

export const hiqCrewMembersRelations = relations(hiqCrewMembers, ({one}) => ({
	hiqCrew: one(hiqCrews, {
		fields: [hiqCrewMembers.crewId],
		references: [hiqCrews.id]
	}),
	hiqMember: one(hiqMembers, {
		fields: [hiqCrewMembers.memberId],
		references: [hiqMembers.id]
	}),
}));

export const hiqCrewLikesRelations = relations(hiqCrewLikes, ({one}) => ({
	hiqMember: one(hiqMembers, {
		fields: [hiqCrewLikes.memberId],
		references: [hiqMembers.id]
	}),
	hiqCrewPost: one(hiqCrewPosts, {
		fields: [hiqCrewLikes.postId],
		references: [hiqCrewPosts.id]
	}),
}));

export const hiqSettlementParticipantsRelations = relations(hiqSettlementParticipants, ({one}) => ({
	hiqSettlementItem: one(hiqSettlementItems, {
		fields: [hiqSettlementParticipants.itemId],
		references: [hiqSettlementItems.id]
	}),
	hiqMember: one(hiqMembers, {
		fields: [hiqSettlementParticipants.memberId],
		references: [hiqMembers.id]
	}),
}));

export const hiqSettlementItemsRelations = relations(hiqSettlementItems, ({one, many}) => ({
	hiqSettlementParticipants: many(hiqSettlementParticipants),
	hiqMember: one(hiqMembers, {
		fields: [hiqSettlementItems.payerId],
		references: [hiqMembers.id]
	}),
	hiqSettlement: one(hiqSettlements, {
		fields: [hiqSettlementItems.settlementId],
		references: [hiqSettlements.id]
	}),
}));

export const hiqSettlementsRelations = relations(hiqSettlements, ({one, many}) => ({
	hiqMember: one(hiqMembers, {
		fields: [hiqSettlements.creatorId],
		references: [hiqMembers.id]
	}),
	hiqCrew: one(hiqCrews, {
		fields: [hiqSettlements.crewId],
		references: [hiqCrews.id]
	}),
	hiqSettlementItems: many(hiqSettlementItems),
}));

export const golfMatchSessionsRelations = relations(golfMatchSessions, ({one}) => ({
	hiqMember: one(hiqMembers, {
		fields: [golfMatchSessions.hostId],
		references: [hiqMembers.id]
	}),
}));

export const hiqNotificationsRelations = relations(hiqNotifications, ({one}) => ({
	hiqMember: one(hiqMembers, {
		fields: [hiqNotifications.memberId],
		references: [hiqMembers.id]
	}),
}));

export const golfClubCoursesRelations = relations(golfClubCourses, ({one}) => ({
	golfClub: one(golfClubs, {
		fields: [golfClubCourses.clubId],
		references: [golfClubs.id]
	}),
}));

export const golfClubsRelations = relations(golfClubs, ({many}) => ({
	golfClubCourses: many(golfClubCourses),
}));

export const rankueGolfCoursesRelations = relations(rankueGolfCourses, ({one}) => ({
	rankueGolfClub: one(rankueGolfClubs, {
		fields: [rankueGolfCourses.clubId],
		references: [rankueGolfClubs.id]
	}),
}));

export const rankueGolfClubsRelations = relations(rankueGolfClubs, ({many}) => ({
	rankueGolfCourses: many(rankueGolfCourses),
}));