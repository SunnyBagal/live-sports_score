import {Router} from "express";
import {matchIdParamSchema} from "../validation/matches.js";
import {createCommentarySchema, listCommentaryQuerySchema} from "../validation/commentary.js";
import {db} from "../db/db.js";
import {commentary} from "../db/schema.js";
import { desc, eq } from "drizzle-orm";

export const commentaryRouter = Router({ mergeParams: true });

const MAX_LIMIT = 100;



commentaryRouter.get('/', async (req, res) => {
    const paramParsed = matchIdParamSchema.safeParse(req.params);
    if (!paramParsed.success) {
        return res.status(400).json({
            error: 'Invalid match ID',
            details: paramParsed.error.issues,
        });
    }

    const queryParsed = listCommentaryQuerySchema.safeParse(req.query);
    if (!queryParsed.success) {
        return res.status(400).json({
            error: 'Invalid query',
            details: queryParsed.error.issues,
        });
    }

    const limit = Math.min(queryParsed.data.limit ?? 100, MAX_LIMIT);

    try {

        const { id: matchId } = paramParsed.data;
        const {limit = 10} = queryParsed.data;

        const data = await db
            .select()
            .from(commentary)
            .where(eq(commentary.matchId, paramParsed.data.id))
            .orderBy(desc(commentary.createdAt))
            .limit(limit);
        return res.status(200).json({ data });

    } catch (e) {
        console.error('Failed to list commentary:', e);
        return res.status(500).json({
            error: 'Failed to list commentary',
        });
    }
});

commentaryRouter.post('/', async (req, res) => {
    const paramParsed = matchIdParamSchema.safeParse(req.params);

    if (!paramParsed.success) {
        return res.status(400).json({
            error: 'Invalid match ID',
            details: paramParsed.error.issues
        });
    }

    const bodyParsed = createCommentarySchema.safeParse(req.body);

    if (!bodyParsed.success) {
        return res.status(400).json({
            error: 'Invalid commentary data',
            details: bodyParsed.error.issues
        });
    }

    try {
        const{ minute, ...rest } = bodyParsed.data;
        const [result] = await db.insert(commentary).values({
            matchId: paramParsed.data.id,
            minute,
            ...rest
        }).returning();

        if(res.app.locals.broadcastCommentary) {
            res.app.locals.broadcastCommentary(result.matchId, result)
        }

        res.status(201).json({data: result});
    } catch (e) {
        console.error('Failed to create commentary:', e);
        res.status(500).json({
            error: 'Failed to create commentary'
        });
    }
});