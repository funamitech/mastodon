# frozen_string_literal: true

class ActivityPub::VerifyQuoteService < BaseService
  MAX_SYNCHRONOUS_DEPTH = 2

  # Optionally fetch quoted post, and accept the quote without going through
  # the FEP-044f approval flow, like Misskey does
  def call(quote, approval_uri, fetchable_quoted_uri: nil, prefetched_quoted_object: nil, request_id: nil, depth: nil)
    @request_id = request_id
    @depth = depth || 0
    @quote = quote
    @approval_uri = approval_uri.presence || @quote.approval_uri
    @fetching_error = nil

    fetch_quoted_post_if_needed!(fetchable_quoted_uri, prefetched_body: prefetched_quoted_object)

    # Raise an error if we failed to fetch the status
    raise @fetching_error if @quote.quoted_status.nil? && @fetching_error
    return if @quote.quoted_status.nil?

    if @quote.quoted_account.local?
      @quote.ensure_quoted_access
      @quote.accept!
    else
      @quote.accept!(approval_uri: @approval_uri)
    end
  end

  private

  def fetch_quoted_post_if_needed!(uri, prefetched_body: nil)
    return if uri.nil? || @quote.quoted_status.present?

    status = ActivityPub::TagManager.instance.uri_to_resource(uri, Status)
    raise Mastodon::RecursionLimitExceededError if @depth > MAX_SYNCHRONOUS_DEPTH && status.nil?

    status ||= ActivityPub::FetchRemoteStatusService.new.call(uri, on_behalf_of: @quote.account.followers.local.first, prefetched_body:, request_id: @request_id, depth: @depth + 1)

    @quote.update(quoted_status: status) if status.present? && !status.reblog?
  rescue Mastodon::RecursionLimitExceededError, Mastodon::UnexpectedResponseError, *Mastodon::HTTP_CONNECTION_ERRORS => e
    @fetching_error = e
  end
end
