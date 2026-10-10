# frozen_string_literal: true

require 'cogbox'

cogbox = Cogbox::Cogbox.new

cogbox.list(Cogbox::ListSandboxesQuery.new(
               limit: 10,
               labels: { 'env' => 'dev' },
               states: [Cogbox::SandboxState::STARTED],
               sort: Cogbox::SandboxListSortField::CREATED_AT,
               order: Cogbox::SandboxListSortDirection::DESC
             )).each do |sandbox|
  puts sandbox.id
end
