import arcjet,{detectBot,shield,slidingWindow} from "@arcjet/node";

const arcjetKey = process.env.ARCJET_KEY;
const arcjetMode = process.env.ARCJET_ENV === 'development' ? 'DRY_RUN' : 'LIVE';

if (!arcjetKey) throw new Error('Arcjet key env variable is missing or missing arcjet');

export const httpArcjet = arcjetKey ?
    arcjet({
        key: arcjetKey,
        rules: [
            shield({ mode: arcjetMode }),
            detectBot({mode: arcjetMode, allow: ['CATEGORY:SEARCH_ENGINE', "CATEGORY:PREVIEW"]}),
            slidingWindow({ mode :  arcjetMode, interval: '10s', max: 50})
        ],
    }): null;

export const wsArcjet = arcjetKey ?
    arcjet({
        key: arcjetKey,
        rules: [
            shield({ mode: arcjetMode }),
            detectBot({mode: arcjetMode, allow: ['CATEGORY:SEARCH_ENGINE', "CATEGORY:PREVIEW"]}),
            slidingWindow({ mode :  arcjetMode, interval: '2s', max: 5})
        ],
    }): null;


export function securityMiddleware(){

    return async (req, res, next) => {
        if(!httpArcjet) return next();

        if(req.path?.startsWith('/ws')) return next();

        try {
            const decision = await httpArcjet.protect(req);

            if(decision.isDenied()){
                if(decision.reason.isRateLimit()){
                    return res.status(429).json({
                        error: 'Too many requests'
                    });
                }
                return res.status(403).json({
                    error: 'Forbidden'
                });
            }

            if (typeof decision.isChallenged === 'function' && decision.isChallenged()){
                return res.status(403).json({
                    error: 'Verification required'
                });
            }

        } catch (e){
            console.error('Arcjet middleware error:', e);
            return res.status(503).json({
                error: 'Service Unavailable'});
        }

        next();

    }
}


