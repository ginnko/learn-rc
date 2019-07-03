import { createForm, formShape } from '../../rc-form';
import React, { Component } from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';

class Form extends Component {
  submit = () => {
    this.props.form.validateFields((error, value) => {
      console.log(error, value);
    });
  }

  render() {
    let errors;
    const { getFieldProps, getFieldError } = this.props.form;
    return (
      <div>
        <input
          {
            ...getFieldProps('normal')
          }
        />
        <input
          {
            ...getFieldProps('required', {
              onChange(){},
              rules: [{
                required: true
              }]
            })
          }
        />
        {
          (
            errors = getFieldError('required') ? errors.join(',') : null
          )
        }
        <button onClick={this.submit}>submit</button>
      </div>
    );
  }
}

Form.propTypes = {
  form: formShape
};

const FormWrapper = createForm()(Form);
export default FormWrapper;

const wrapper = document.getElementById('create-article-form');
wrapper ? ReactDOM.render(<FormWrapper />, wrapper) : false;
