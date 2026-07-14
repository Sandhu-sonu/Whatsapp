export const groupSelectors = {
  header: 'header',

  activeTitle: 'header span[title]',

  getGroupLocator: (page: any, groupName: string) =>
    page.getByText(groupName, { exact: true })
};