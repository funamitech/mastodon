import { useCallback, useState, useEffect } from 'react';

import { defineMessages, useIntl, FormattedMessage } from 'react-intl';

import { Helmet } from 'react-helmet';
import { useParams, useHistory, Link } from 'react-router-dom';

import { isFulfilled } from '@reduxjs/toolkit';

import Toggle from 'react-toggle';

import ChevronRightIcon from '@/material-icons/400-24px/chevron_right.svg?react';
import ListAltIcon from '@/material-icons/400-24px/list_alt.svg?react';
import { fetchList } from 'flavours/glitch/actions/lists';
import { createList, updateList } from 'flavours/glitch/actions/lists_typed';
import { apiGetAccounts } from 'flavours/glitch/api/lists';
import type { ApiAccountJSON } from 'flavours/glitch/api_types/accounts';
import type { RepliesPolicyType } from 'flavours/glitch/api_types/lists';
import { Avatar } from 'flavours/glitch/components/avatar';
import { AvatarGroup } from 'flavours/glitch/components/avatar_group';
import { Column } from 'flavours/glitch/components/column';
import { ColumnHeader } from 'flavours/glitch/components/column_header';
import { Icon } from 'flavours/glitch/components/icon';
import { LoadingIndicator } from 'flavours/glitch/components/loading_indicator';
import { useAppDispatch, useAppSelector } from 'flavours/glitch/store';

import { messages as membersMessages } from './members';

const messages = defineMessages({
  edit: { id: 'column.edit_list', defaultMessage: 'Edit list' },
  create: { id: 'column.create_list', defaultMessage: 'Create list' },
});

const MembersLink: React.FC<{
  id: string;
}> = ({ id }) => {
  const intl = useIntl();
  const [avatarCount, setAvatarCount] = useState(0);
  const [avatarAccounts, setAvatarAccounts] = useState<ApiAccountJSON[]>([]);

  useEffect(() => {
    void apiGetAccounts(id)
      .then((data) => {
        setAvatarCount(data.length);
        setAvatarAccounts(data.slice(0, 3));
      })
      .catch(() => {
        // Nothing
      });
  }, [id]);

  return (
    <Link to={`/lists/${id}/members`} className='app-form__link'>
      <div className='app-form__link__text'>
        <strong>
          {intl.formatMessage(membersMessages.manageMembers)}
          <Icon id='chevron_right' icon={ChevronRightIcon} />
        </strong>
        <FormattedMessage
          id='lists.list_members_count'
          defaultMessage='{count, plural, one {# member} other {# members}}'
          values={{ count: avatarCount }}
        />
      </div>

      <AvatarGroup compact>
        {avatarAccounts.map((a) => (
          <Avatar key={a.id} account={a} size={30} />
        ))}
      </AvatarGroup>
    </Link>
  );
};

const NewList: React.FC<{
  multiColumn?: boolean;
}> = ({ multiColumn }) => {
  const dispatch = useAppDispatch();
  const { id } = useParams<{ id?: string }>();
  const intl = useIntl();
  const history = useHistory();

  const list = useAppSelector((state) =>
    id ? state.lists.get(id) : undefined,
  );
  const [title, setTitle] = useState('');
  const [exclusive, setExclusive] = useState(false);
  const [repliesPolicy, setRepliesPolicy] = useState<RepliesPolicyType>('list');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (id) {
      dispatch(fetchList(id));
    }
  }, [dispatch, id]);

  useEffect(() => {
    if (id && list) {
      setTitle(list.title);
      setExclusive(list.exclusive);
      setRepliesPolicy(list.replies_policy);
    }
  }, [setTitle, setExclusive, setRepliesPolicy, id, list]);

  const handleTitleChange = useCallback(
    ({ target: { value } }: React.ChangeEvent<HTMLInputElement>) => {
      setTitle(value);
    },
    [setTitle],
  );

  const handleExclusiveChange = useCallback(
    ({ target: { checked } }: React.ChangeEvent<HTMLInputElement>) => {
      setExclusive(checked);
    },
    [setExclusive],
  );

  const handleRepliesPolicyChange = useCallback(
    ({ target: { value } }: React.ChangeEvent<HTMLSelectElement>) => {
      setRepliesPolicy(value as RepliesPolicyType);
    },
    [setRepliesPolicy],
  );

  const handleSubmit = useCallback(() => {
    setSubmitting(true);

    if (id) {
      void dispatch(
        updateList({
          id,
          title,
          exclusive,
          replies_policy: repliesPolicy,
        }),
      ).then(() => {
        setSubmitting(false);
        return '';
      });
    } else {
      void dispatch(
        createList({
          title,
          exclusive,
          replies_policy: repliesPolicy,
        }),
      ).then((result) => {
        setSubmitting(false);

        if (isFulfilled(result)) {
          history.replace(`/lists/${result.payload.id}/edit`);
          history.push(`/lists/${result.payload.id}/members`);
        }

        return '';
      });
    }
  }, [history, dispatch, setSubmitting, id, title, exclusive, repliesPolicy]);

  return (
    <Column
      bindToDocument={!multiColumn}
      label={intl.formatMessage(id ? messages.edit : messages.create)}
    >
      <ColumnHeader
        title={intl.formatMessage(id ? messages.edit : messages.create)}
        icon='list-ul'
        iconComponent={ListAltIcon}
        multiColumn={multiColumn}
        showBackButton
      />

      <div className='scrollable'>
        <form className='simple_form app-form' onSubmit={handleSubmit}>
          <div className='fields-group'>
            <div className='input with_label'>
              <div className='label_input'>
                <label htmlFor='list_title'>
                  <FormattedMessage
                    id='lists.list_name'
                    defaultMessage='List name'
                  />
                </label>

                <div className='label_input__wrapper'>
                  <input
                    id='list_title'
                    type='text'
                    value={title}
                    onChange={handleTitleChange}
                    maxLength={30}
                    required
                    placeholder=' '
                  />
                </div>
              </div>
            </div>
          </div>

          <div className='fields-group'>
            <div className='input with_label'>
              <div className='label_input'>
                <label htmlFor='list_replies_policy'>
                  <FormattedMessage
                    id='lists.show_replies_to'
                    defaultMessage='Include replies from list members to'
                  />
                </label>

                <div className='label_input__wrapper'>
                  <select
                    id='list_replies_policy'
                    value={repliesPolicy}
                    onChange={handleRepliesPolicyChange}
                  >
                    <FormattedMessage
                      id='lists.replies_policy.none'
                      defaultMessage='No one'
                    >
                      {(msg) => <option value='none'>{msg}</option>}
                    </FormattedMessage>
                    <FormattedMessage
                      id='lists.replies_policy.list'
                      defaultMessage='Members of the list'
                    >
                      {(msg) => <option value='list'>{msg}</option>}
                    </FormattedMessage>
                    <FormattedMessage
                      id='lists.replies_policy.followed'
                      defaultMessage='Any followed user'
                    >
                      {(msg) => <option value='followed'>{msg}</option>}
                    </FormattedMessage>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {id && (
            <div className='fields-group'>
              <MembersLink id={id} />
            </div>
          )}

          <div className='fields-group'>
            {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
            <label className='app-form__toggle'>
              <div className='app-form__toggle__label'>
                <strong>
                  <FormattedMessage
                    id='lists.exclusive'
                    defaultMessage='Hide members in Home'
                  />
                </strong>
                <span className='hint'>
                  <FormattedMessage
                    id='lists.exclusive_hint'
                    defaultMessage='If someone is on this list, hide them in your Home feed to avoid seeing their posts twice.'
                  />
                </span>
              </div>

              <div className='app-form__toggle__toggle'>
                <div>
                  <Toggle
                    checked={exclusive}
                    onChange={handleExclusiveChange}
                  />
                </div>
              </div>
            </label>
          </div>

          <div className='actions'>
            <button className='button' type='submit'>
              {submitting ? (
                <LoadingIndicator />
              ) : id ? (
                <FormattedMessage id='lists.save' defaultMessage='Save' />
              ) : (
                <FormattedMessage id='lists.create' defaultMessage='Create' />
              )}
            </button>
          </div>
        </form>
      </div>

      <Helmet>
        <title>
          {intl.formatMessage(id ? messages.edit : messages.create)}
        </title>
        <meta name='robots' content='noindex' />
      </Helmet>
    </Column>
  );
};

// eslint-disable-next-line import/no-default-export
export default NewList;
