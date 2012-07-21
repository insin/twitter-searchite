var forms = require('newforms')

exports.SearchForm = forms.Form.extend({
  searchText : forms.CharField({helpText: 'Separate terms with " OR "'})
, filterText : forms.CharField({helpText: 'Separate terms with ","'})
})
