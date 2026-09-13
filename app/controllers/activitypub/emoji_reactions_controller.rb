# frozen_string_literal: true

class ActivityPub::EmojiReactionsController < ActivityPub::BaseController
  include Authorization

  REACTIONS_LIMIT = 60

  vary_by -> { 'Signature' if authorized_fetch_mode? }

  before_action :require_account_signature!, if: :authorized_fetch_mode?
  before_action :set_status
  before_action :set_reactions

  def index
    expires_in 0, public: @status.distributable? && public_fetch_mode?
    render json: emoji_reactions_collection_presenter, serializer: ActivityPub::CollectionSerializer, adapter: ActivityPub::Adapter, content_type: 'application/activity+json'
  end

  private

  def pundit_user
    signed_request_account
  end

  def set_status
    @status = @account.statuses.find(params[:status_id])
    authorize @status, :show?
  rescue ActiveRecord::RecordNotFound, Mastodon::NotPermittedError
    not_found
  end

  def set_reactions
    @reactions = @status.status_reactions.joins(:account).merge(Account.without_suspended)
    @reactions = @reactions.paginate_by_min_id(REACTIONS_LIMIT, params[:min_id])
  end

  def emoji_reactions_collection_presenter
    page = ActivityPub::CollectionPresenter.new(
      id: ActivityPub::TagManager.instance.emoji_reactions_uri_for(@status, page_params),
      type: :unordered,
      part_of: ActivityPub::TagManager.instance.emoji_reactions_uri_for(@status),
      next: next_page,
      items: @reactions
    )

    return page if page_requested?

    ActivityPub::CollectionPresenter.new(
      id: ActivityPub::TagManager.instance.emoji_reactions_uri_for(@status),
      type: :unordered,
      first: page
    )
  end

  def page_requested?
    truthy_param?(:page)
  end

  def next_page
    return if @reactions.size < REACTIONS_LIMIT

    ActivityPub::TagManager.instance.emoji_reactions_uri_for(@status, page: true, min_id: @reactions.last.id)
  end

  def page_params
    params_slice(:min_id).merge(page: true)
  end
end
