-- Uses: HMGET, HMSET, EXPIRE
-- Stores bucket state (tokens + lastRefill) in a Hash
local key = KEYS[1]
local now = tonumber(ARGV[1])
local maxTokens = tonumber(ARGV[2])
local refillRate = tonumber(ARGV[3])
local ttlSec = tonumber(ARGV[4])

local bucket = redis.call('HMGET', key, 'tokens', 'lastRefill')
local tokens = tonumber(bucket[1])
local lastRefill = tonumber(bucket[2])

if tokens == nil then 
  tokens = maxTokens
  lastRefill = now
end

local elapsedSec = (now - lastRefill) / 1000
local newTokens = math.min(maxTokens, tokens + elapsedSec * refillRate)

if newTokens >= 1 then 
  newTokens = newTokens - 1
  redis.call('HMSET', key, 'tokens', newTokens, 'lastRefill', now)
  redis.call('EXPIRE', key, ttlSec)
  return {
    1, math.floor(newTokens), 0
  }
else 
  local retryAfter = math.ceil((1 - newTokens) / refillRate * 1000)
  redis.call('HMSET', key, 'tokens', newTokens, 'lastRefill', now)
  redis.call('EXPIRE', key, ttlSec)
  return {0, 0, retryAfter}
end