# frozen_string_literal: true

# Fetch the emoji reactions of a remote post from its origin server, through
# its FEP-c0e0 `emojiReactions` collection or, for Misskey and its forks,
# through their public API
class ActivityPub::FetchReactionsWorker
  include Sidekiq::Worker
  include ExponentialBackoff

  sidekiq_options queue: 'pull', retry: 3

  def perform(status_id, options = {})
    batch  = WorkerBatch.new(options.delete('batch_id')) if options['batch_id']
    status = Status.remote.find_by(id: status_id)

    return if status.nil? || !status.should_fetch_reactions?

    status.touch_fetched_reactions!
    ActivityPub::FetchReactionsService.new.call(status, **options.deep_symbolize_keys)
  ensure
    batch&.remove_job(jid)
  end
end
