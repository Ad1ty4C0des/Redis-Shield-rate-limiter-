-- Runs ATOMICALLY on the Redis server (no race conditions)
-- Uses: ZREMRANGEBYSCORE, ZCARD, ZADD, PEXPIRE
local key = KEYS[1]
local now = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local maxRequests = tonumber(ARGV[3])

local windowStart = now - windowMs
redis.call('ZREMRANGEBYSCORE', key, '-inf', windowStart)

local currentCount = redis.call('ZCARD', key)

if currentCount < maxRequests then
  local member = now .. '-' .. math.random(1, 1000000)
  redis.call('ZADD', key, now, member)
  redis.call('PEXPIRE', key, windowMs)
  return {1, maxRequests - currentCount - 1, 0}
else 
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local retryAfter = 0
  if #oldest >= 2 then 
    retryAfter = math.ceil(tonumber(oldest[2]) + windowMs - now)
  end
  return{0, 0, retryAfter}
end