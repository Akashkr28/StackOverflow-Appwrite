import { answerCollection, db, questionCollection, voteCollection } from "@/models/name";
import { ID, Query } from "node-appwrite";
import { NextRequest, NextResponse } from "next/server";
import { databases, users } from "@/models/server/config";
import { UserPrefs } from "@/store/Auth";

export async function POST(request: NextRequest){
    try {
        // Grab the data
        const {votedById, voteStatus, type, typeId} = await request.json()

        // list-documents
        const response = await databases.listDocuments(db, voteCollection, [
            Query.equal('votedById', votedById),
            Query.equal('type', type),
            Query.equal('typeId', typeId),
        ]);

        if(response.documents.length > 0){
            await databases.deleteDocument(db, voteCollection, response.documents[0].$id)

            // decreae the reputation
            const questionOrAnswer = await databases.getDocument(
                db,
                type === 'question' ? questionCollection : answerCollection,
                typeId
            );

            const authorPrefs = await users.getPrefs<UserPrefs>(questionOrAnswer.authorId);

            await users.updatePrefs<UserPrefs>(questionOrAnswer.authorId, {
                reputation:
                    response.documents[0].voteStatus === 'upvoted'
                        ? Number(authorPrefs.reputation) - 1
                        : Number(authorPrefs.reputation) + 1
            })
        };

        // that means prev vote does not exists or vote status changes
        if(response.documents[0]?.voteStatus !== voteStatus){
            const doc = await databases.createDocument(db, voteCollection, ID.unique(), {
                type,
                typeId,
                votedById,
                voteStatus
            });

            // Increase or decrease the reputation
            const questionOrAnswer = await databases.getDocument(
                db,
                type === "question" ? questionCollection : answerCollection,
                typeId
            );

            const authorPrefs = await users.getPrefs<UserPrefs>(questionOrAnswer.authorId)

            // if vote was present then we have to update the reputation
            if (response.documents[0]) {
                await users.updatePrefs<UserPrefs>(questionOrAnswer.authorId, {
                    reputation:
                        // that means prev vote was "upvoted" and new value is "downvoted" so we have to decrease the reputation
                        response.documents[0].voteStatus === "upvoted"
                            ? Number(authorPrefs.reputation) - 1
                            : Number(authorPrefs.reputation) + 1,
                });
            } else {
                await users.updatePrefs<UserPrefs>(questionOrAnswer.authorId, {
                    reputation:
                        // that means prev vote was "upvoted" and new value is "downvoted" so we have to decrease the reputation
                        voteStatus === "upvoted"
                            ? Number(authorPrefs.reputation) + 1
                            : Number(authorPrefs.reputation) - 1,
                }
            ); 
        }

    }

        const [upvotes, downvotes] = await Promise.all([
            databases.listDocuments(db, voteCollection, [
                Query.equal('type', type),
                Query.equal('typeId', typeId),
                Query.equal('voteStatus', 'upvoted'),
                Query.equal('votedById', votedById),
                Query.limit(1),
            ]),
            databases.listDocuments(db, voteCollection, [
                Query.equal('type', type),
                Query.equal('typeId', typeId),
                Query.equal('voteStatus', 'downvoted'),
                Query.equal('votedById', votedById),
                Query.limit(1),
            ]),
        ]);

        return NextResponse.json(
            {
                data: {
                    document: null, voteResult: upvotes.total = downvotes.total
                },
                message: 'Vote added successfully'
            },
            {
                status: 200
            }
        );

    } catch (error: any) {
        return NextResponse.json(
            {
                message: error?.message || 'An error occurred'
            },
            {
                status: error?.status || error?.code || 500
            }
        );
    }
}