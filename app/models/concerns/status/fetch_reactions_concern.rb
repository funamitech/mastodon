# frozen_string_literal: true

module Status::FetchReactionsConcern
  extend ActiveSupport::Concern

  # Debounce period for fetching the reactions of a remote post from its origin
  FETCH_REACTIONS_COOLDOWN_MINUTES = 15.minutes

  def should_fetch_reactions?
    !local? && distributable? && !Rails.cache.exist?(fetch_reactions_cache_key)
  end

  def touch_fetched_reactions!
    Rails.cache.write(fetch_reactions_cache_key, true, expires_in: FETCH_REACTIONS_COOLDOWN_MINUTES)
  end

  private

  def fetch_reactions_cache_key
    "fetch_reactions:#{id}"
  end
end
