/* eslint-disable react/prefer-es6-class */
/* eslint-disable prefer-promise-reject-errors */

import React from 'react';
import createReactClass from 'create-react-class';
import AsyncValidator from 'async-validator';
import warning from 'warning';
import get from 'lodash/get';
import set from 'lodash/set';
import eq from 'lodash/eq';
import createFieldsStore from './createFieldsStore';
import {
  argumentContainer,
  identity,
  normalizeValidateRules,
  getValidateTriggers,
  getValueFromEvent,
  hasRules,
  getParams,
  isEmptyObject,
  flattenArray,
} from './utils';

const DEFAULT_TRIGGER = 'onChange';

function createBaseForm(option = {}, mixins = []) {
  const {
    validateMessages,
    onFieldsChange,
    onValuesChange,
    mapProps = identity,
    mapPropsToFields,
    fieldNameProp,
    fieldMetaProp,
    fieldDataProp,
    formPropName = 'form',
    name: formName,
    // @deprecated
    withRef,
  } = option;

  return function decorate(WrappedComponent) {
    const Form = createReactClass({
      mixins,

      getInitialState() {
        const fields = mapPropsToFields && mapPropsToFields(this.props);
        this.fieldsStore = createFieldsStore(fields || {});

        this.instances = {};
        this.cachedBind = {};
        this.clearedFieldMetaCache = {};

        this.renderFields = {};
        this.domFields = {};

        // HACK: https://github.com/ant-design/ant-design/issues/6406
        ['getFieldsValue',
          'getFieldValue',
          'setFieldsInitialValue',
          'getFieldsError',
          'getFieldError',
          'isFieldValidating',
          'isFieldsValidating',
          'isFieldsTouched',
          'isFieldTouched'].forEach(key => {
          this[key] = (...args) => {
            if (process.env.NODE_ENV !== 'production') {
              warning(
                false,
                'you should not use `ref` on enhanced form, please use `wrappedComponentRef`. ' +
                      'See: https://github.com/react-component/form#note-use-wrappedcomponentref-instead-of-withref-after-rc-form140'
              );
            }
            return this.fieldsStore[key](...args);
          };
        });

        return {
          submitting: false,
        };
      },

      componentDidMount() {
        this.cleanUpUselessFields();
      },

      componentWillReceiveProps(nextProps) {
        if (mapPropsToFields) {
          this.fieldsStore.updateFields(mapPropsToFields(nextProps));
        }
      },

      componentDidUpdate() {
        this.cleanUpUselessFields();
      },

      onCollectCommon(name, action, args) {
        const fieldMeta = this.fieldsStore.getFieldMeta(name);
        if (fieldMeta[action]) {
          fieldMeta[action](...args);
        } else if (fieldMeta.originalProps && fieldMeta.originalProps[action]) {
          fieldMeta.originalProps[action](...args);
        }
        const value = fieldMeta.getValueFromEvent ?
          fieldMeta.getValueFromEvent(...args) :
          getValueFromEvent(...args);
        if (onValuesChange && value !== this.fieldsStore.getFieldValue(name)) {
          const valuesAll = this.fieldsStore.getAllValues();
          const valuesAllSet = {};
          valuesAll[name] = value;
          Object.keys(valuesAll).forEach(key => set(valuesAllSet, key, valuesAll[key]));
          onValuesChange({
            [formPropName]: this.getForm(),
            ...this.props
          }, set({}, name, value), valuesAllSet);
        }
        const field = this.fieldsStore.getField(name);
        return ({ name, field: { ...field, value, touched: true }, fieldMeta });
      },

      onCollect(name_, action, ...args) {
        const { name, field, fieldMeta } = this.onCollectCommon(name_, action, args);
        const { validate } = fieldMeta;

        this.fieldsStore.setFieldsAsDirty();

        const newField = {
          ...field,
          dirty: hasRules(validate),
        };
        this.setFields({
          [name]: newField,
        });
      },

      // 在这个函数里给field添加了touch:true属性
      // 更新了value属性
      // 添加了dirty属性
      onCollectValidate(name_, action, ...args) {
        const { field, fieldMeta } = this.onCollectCommon(name_, action, args);
        const newField = {
          ...field,
          dirty: true,
        };

        // 此处是给所有已存在的（？）字段dirty值都设为true
        this.fieldsStore.setFieldsAsDirty();

        this.validateFieldsInternal([newField], {
          action,
          options: {
            firstFields: !!fieldMeta.validateFirst,
          },
        });
      },

      getCacheBind(name, action, fn) {
        if (!this.cachedBind[name]) {
          this.cachedBind[name] = {};
        }
        const cache = this.cachedBind[name];
        if (!cache[action] || cache[action].oriFn !== fn) {
          cache[action] = {
            fn: fn.bind(this, name, action),
            oriFn: fn,
          };
        }
        return cache[action].fn;
      },

      getFieldDecorator(name, fieldOption) {
        const props = this.getFieldProps(name, fieldOption);
        return (fieldElem) => {
          // We should put field in record if it is rendered
          this.renderFields[name] = true;

          const fieldMeta = this.fieldsStore.getFieldMeta(name);
          const originalProps = fieldElem.props;
          if (process.env.NODE_ENV !== 'production') {
            const valuePropName = fieldMeta.valuePropName;
            warning(
              !(valuePropName in originalProps),
              `\`getFieldDecorator\` will override \`${valuePropName}\`, ` +
              `so please don't set \`${valuePropName}\` directly ` +
              `and use \`setFieldsValue\` to set it.`
            );
            const defaultValuePropName =
              `default${valuePropName[0].toUpperCase()}${valuePropName.slice(1)}`;
            warning(
              !(defaultValuePropName in originalProps),
              `\`${defaultValuePropName}\` is invalid ` +
              `for \`getFieldDecorator\` will set \`${valuePropName}\`,` +
              ` please use \`option.initialValue\` instead.`
            );
          }
          fieldMeta.originalProps = originalProps;
          fieldMeta.ref = fieldElem.ref;
          return React.cloneElement(fieldElem, {
            ...props,
            ...this.fieldsStore.getFieldValuePropValue(fieldMeta),
          });
        };
      },

      // 这个函数将对应的字段的实时数据和元数据以属性的形式注入给标签
      getFieldProps(name, usersFieldOption = {}) {
        if (!name) {
          throw new Error('Must call `getFieldProps` with valid name string!');
        }
        if (process.env.NODE_ENV !== 'production') {
          warning(
            this.fieldsStore.isValidNestedFieldName(name),
            `One field name cannot be part of another, e.g. \`a\` and \`a.b\`. Check field: ${name}`
          );
          warning(
            !('exclusive' in usersFieldOption),
            '`option.exclusive` of `getFieldProps`|`getFieldDecorator` had been remove.'
          );
        }

        delete this.clearedFieldMetaCache[name];

        const fieldOption = {
          name,
          trigger: DEFAULT_TRIGGER,
          valuePropName: 'value',
          validate: [],
          ...usersFieldOption,
        };
        const {
          rules,
          trigger,
          validateTrigger = trigger,
          validate,
        } = fieldOption;
        const fieldMeta = this.fieldsStore.getFieldMeta(name);
        if ('initialValue' in fieldOption) {
          fieldMeta.initialValue = fieldOption.initialValue;
        }

        const inputProps = {
          ...this.fieldsStore.getFieldValuePropValue(fieldOption),
          ref: this.getCacheBind(name, `${name}__ref`, this.saveRef),
        };
        if (fieldNameProp) {
          inputProps[fieldNameProp] = formName ? `${formName}_${name}` : name;
        }

        console.log(333, inputProps);

        // 这里开始处理表单验证的逻辑
        // 在normalizeValidateRules中，触发时机被转换位以数组的结构存储
        // rules则本身就是数组结构，每个元素是一个规则对象
        const validateRules = normalizeValidateRules(validate, rules, validateTrigger);

        console.log('validateRules:', validateRules);
        const validateTriggers = getValidateTriggers(validateRules);
        console.log('validateTriggers:', validateTriggers);
        validateTriggers.forEach((action) => {
          if (inputProps[action]) return;
          inputProps[action] = this.getCacheBind(name, action, this.onCollectValidate);
        });

        // make sure that the value will be collect
        if (trigger && validateTriggers.indexOf(trigger) === -1) {
          inputProps[trigger] = this.getCacheBind(name, trigger, this.onCollect);
        }

        // 到此处this.getCacheBind函数调用了三次
        // 绑定了三个函数
        // 有待看它们具体是干嘛的
        // 第一个没看明白


        const meta = {
          ...fieldMeta,
          ...fieldOption,
          validate: validateRules,
        };
        this.fieldsStore.setFieldMeta(name, meta);
        if (fieldMetaProp) {
          inputProps[fieldMetaProp] = meta;
        }

        if (fieldDataProp) {
          inputProps[fieldDataProp] = this.fieldsStore.getField(name);
        }

        // This field is rendered, record it
        this.renderFields[name] = true;

        // 这里包含了当前表单字段的所有信息
        // 包括名字、触发时机、验证规则
        return inputProps;
      },

      getFieldInstance(name) {
        return this.instances[name];
      },

      getRules(fieldMeta, action) {
        const actionRules = fieldMeta.validate.filter((item) => {
          return !action || item.trigger.indexOf(action) >= 0;
        }).map((item) => item.rules);
        return flattenArray(actionRules);
      },

      setFields(maybeNestedFields, callback) {
        const fields = this.fieldsStore.flattenRegisteredFields(maybeNestedFields);
        this.fieldsStore.setFields(fields);
        if (onFieldsChange) {
          const changedFields = Object.keys(fields)
            .reduce((acc, name) => set(acc, name, this.fieldsStore.getField(name)), {});
          onFieldsChange({
            [formPropName]: this.getForm(),
            ...this.props
          }, changedFields, this.fieldsStore.getNestedAllFields());
        }
        this.forceUpdate(callback);
      },

      setFieldsValue(changedValues, callback) {
        const { fieldsMeta } = this.fieldsStore;
        const values = this.fieldsStore.flattenRegisteredFields(changedValues);
        const newFields = Object.keys(values).reduce((acc, name) => {
          const isRegistered = fieldsMeta[name];
          if (process.env.NODE_ENV !== 'production') {
            warning(
              isRegistered,
              'Cannot use `setFieldsValue` until ' +
                'you use `getFieldDecorator` or `getFieldProps` to register it.'
            );
          }
          if (isRegistered) {
            const value = values[name];
            acc[name] = {
              value,
            };
          }
          return acc;
        }, {});
        this.setFields(newFields, callback);
        if (onValuesChange) {
          const allValues = this.fieldsStore.getAllValues();
          onValuesChange({
            [formPropName]: this.getForm(),
            ...this.props
          }, changedValues, allValues);
        }
      },

      // 在this.getCacheBind这个函数中调用了下面的函数
      // this.getCacheBind函数中使用了bind创建了一个偏函数
      // 偏函数的前两个参数都已确定，第一个是字段名name，第二个是action
      // 下面这个函数不需要第二个参数action，以下划线作为占位符？
      // 实际调用绑定后的偏函数时，只需传入一个component参数
      saveRef(name, _, component) {
        if (!component) {
          const fieldMeta = this.fieldsStore.getFieldMeta(name);
          if (!fieldMeta.preserve) {
            // after destroy, delete data
            this.clearedFieldMetaCache[name] = {
              field: this.fieldsStore.getField(name),
              meta: fieldMeta,
            };
            this.clearField(name);
          }
          delete this.domFields[name];
          return;
        }
        this.domFields[name] = true;
        this.recoverClearedField(name);
        const fieldMeta = this.fieldsStore.getFieldMeta(name);
        if (fieldMeta) {
          const ref = fieldMeta.ref;
          if (ref) {
            if (typeof ref === 'string') {
              throw new Error(`can not set ref string for ${name}`);
            } else if (typeof ref === 'function') {
              ref(component);
            } else if (Object.prototype.hasOwnProperty.call(ref, 'current')) {
              ref.current = component;
            }
          }
        }
        this.instances[name] = component;
      },

      cleanUpUselessFields() {
        const fieldList = this.fieldsStore.getAllFieldsName();
        const removedList = fieldList.filter(field => {
          const fieldMeta = this.fieldsStore.getFieldMeta(field);
          return (!this.renderFields[field] && !this.domFields[field] && !fieldMeta.preserve);
        });
        if (removedList.length) {
          removedList.forEach(this.clearField);
        }
        this.renderFields = {};
      },

      clearField(name) {
        this.fieldsStore.clearField(name);
        delete this.instances[name];
        delete this.cachedBind[name];
      },

      resetFields(ns) {
        const newFields = this.fieldsStore.resetFields(ns);
        if (Object.keys(newFields).length > 0) {
          this.setFields(newFields);
        }
        if (ns) {
          const names = Array.isArray(ns) ? ns : [ns];
          names.forEach(name => delete this.clearedFieldMetaCache[name]);
        } else {
          this.clearedFieldMetaCache = {};
        }
      },

      // this.clearedFieldMetaCache这个对象存在的意义是什么？
      recoverClearedField(name) {
        if (this.clearedFieldMetaCache[name]) {
          this.fieldsStore.setFields({
            [name]: this.clearedFieldMetaCache[name].field,
          });
          this.fieldsStore.setFieldMeta(name, this.clearedFieldMetaCache[name].meta);
          delete this.clearedFieldMetaCache[name];
        }
      },

      // 这个函数接受了很多的参数
      // 但把相近类型的参数保存在了一个对象中
      // 既能改善函数参数过多书写时的问题
      // 在不传参数的时候也能更方便的通过解构的办法赋予默认值
      // 在刚写的Transmitor类中可以修改为这样的
      validateFieldsInternal(fields, {
        fieldNames,
        action,
        options = {},
      }, callback) {
        const allRules = {};
        const allValues = {};
        const allFields = {};
        const alreadyErrors = {};
        fields.forEach((field) => {
          const name = field.name;
          if (options.force !== true && field.dirty === false) {
            if (field.errors) {
              set(alreadyErrors, name, { errors: field.errors });
            }
            // 遇到一个field.errors为true就整个退出？
            return;
          }
          const fieldMeta = this.fieldsStore.getFieldMeta(name);
          const newField = {
            ...field,
          };
          newField.errors = undefined;
          newField.validating = true;
          newField.dirty = true;
          allRules[name] = this.getRules(fieldMeta, action);
          allValues[name] = newField.value;
          allFields[name] = newField;
        });
        this.setFields(allFields);
        // in case normalize（源码中的注释）
        // 不太明白这里为啥要重新赋值
        Object.keys(allValues).forEach((f) => {
          allValues[f] = this.fieldsStore.getFieldValue(f);
        });
        if (callback && isEmptyObject(allFields)) {
          callback(isEmptyObject(alreadyErrors) ? null : alreadyErrors,
            this.fieldsStore.getFieldsValue(fieldNames));
          return;
        }
        // TODO 2019-07-13 暂停在这里，看不明吧。。。
        const validator = new AsyncValidator(allRules);
        if (validateMessages) {
          validator.messages(validateMessages);
        }
        validator.validate(allValues, options, (errors) => {
          const errorsGroup = {
            ...alreadyErrors,
          };
          if (errors && errors.length) {
            errors.forEach((e) => {
              const errorFieldName = e.field;
              let fieldName = errorFieldName;

              // Handle using array validation rule.
              // ref: https://github.com/ant-design/ant-design/issues/14275
              Object.keys(allRules).some((ruleFieldName) => {
                const rules = allRules[ruleFieldName] || [];

                // Exist if match rule
                if (ruleFieldName === errorFieldName) {
                  fieldName = ruleFieldName;
                  return true;
                }

                // Skip if not match array type
                if (rules.every(({ type }) => type !== 'array') && errorFieldName.indexOf(ruleFieldName) !== 0) {
                  return false;
                }

                // Exist if match the field name
                const restPath = errorFieldName.slice(ruleFieldName.length + 1);
                if (/\d+/.test(restPath)) {
                  fieldName = ruleFieldName;
                  return true;
                }

                return false;
              });

              const field = get(errorsGroup, fieldName);
              if (typeof field !== 'object' || Array.isArray(field)) {
                set(errorsGroup, fieldName, { errors: [] });
              }
              const fieldErrors = get(errorsGroup, fieldName.concat('.errors'));
              fieldErrors.push(e);
            });
          }
          const expired = [];
          const nowAllFields = {};
          Object.keys(allRules).forEach((name) => {
            const fieldErrors = get(errorsGroup, name);
            const nowField = this.fieldsStore.getField(name);
            // avoid concurrency problems
            if (!eq(nowField.value,allValues[name])) {
              expired.push({
                name,
              });
            } else {
              nowField.errors = fieldErrors && fieldErrors.errors;
              nowField.value = allValues[name];
              nowField.validating = false;
              nowField.dirty = false;
              nowAllFields[name] = nowField;
            }
          });
          this.setFields(nowAllFields);
          if (callback) {
            if (expired.length) {
              expired.forEach(({ name }) => {
                const fieldErrors = [{
                  message: `${name} need to revalidate`,
                  field: name,
                }];
                set(errorsGroup, name, {
                  expired: true,
                  errors: fieldErrors,
                });
              });
            }

            callback(isEmptyObject(errorsGroup) ? null : errorsGroup,
              this.fieldsStore.getFieldsValue(fieldNames));
          }
        });
      },

      validateFields(ns, opt, cb) {
        const pending = new Promise((resolve, reject) => {
          const { names, options } = getParams(ns, opt, cb);
          let { callback } = getParams(ns, opt, cb);
          if (!callback || typeof callback === 'function') {
            const oldCb = callback;
            callback = (errors, values) => {
              if (oldCb) {
                oldCb(errors, values);
              } else if (errors) {
                reject({ errors, values });
              } else {
                resolve(values);
              }
            };
          }
          const fieldNames = names ?
            this.fieldsStore.getValidFieldsFullName(names) :
            this.fieldsStore.getValidFieldsName();
          const fields = fieldNames
            .filter(name => {
              const fieldMeta = this.fieldsStore.getFieldMeta(name);
              return hasRules(fieldMeta.validate);
            }).map((name) => {
              const field = this.fieldsStore.getField(name);
              field.value = this.fieldsStore.getFieldValue(name);
              return field;
            });
          if (!fields.length) {
            callback(null, this.fieldsStore.getFieldsValue(fieldNames));
            return;
          }
          if (!('firstFields' in options)) {
            options.firstFields = fieldNames.filter((name) => {
              const fieldMeta = this.fieldsStore.getFieldMeta(name);
              return !!fieldMeta.validateFirst;
            });
          }
          this.validateFieldsInternal(fields, {
            fieldNames,
            options,
          }, callback);
        });
        pending.catch((e) => {
          if (console.error && process.env.NODE_ENV !== 'production') {
            console.error(e);
          }
          return e;
        });
        return pending;
      },

      isSubmitting() {
        if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
          warning(
            false,
            '`isSubmitting` is deprecated. ' +
              'Actually, it\'s more convenient to handle submitting status by yourself.'
          );
        }
        return this.state.submitting;
      },

      submit(callback) {
        if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
          warning(
            false,
            '`submit` is deprecated. ' +
              'Actually, it\'s more convenient to handle submitting status by yourself.'
          );
        }
        const fn = () => {
          this.setState({
            submitting: false,
          });
        };
        this.setState({
          submitting: true,
        });
        callback(fn);
      },

      render() {
        const { wrappedComponentRef, ...restProps } = this.props; // eslint-disable-line
        const formProps = {
          [formPropName]: this.getForm(),
        };
        if (withRef) {
          if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
            warning(
              false,
              '`withRef` is deprecated, please use `wrappedComponentRef` instead. ' +
                'See: https://github.com/react-component/form#note-use-wrappedcomponentref-instead-of-withref-after-rc-form140'
            );
          }
          formProps.ref = 'wrappedComponent';
        } else if (wrappedComponentRef) {
          formProps.ref = wrappedComponentRef;
        }
        const props = mapProps.call(this, {
          ...formProps,
          ...restProps,
        });
        return <WrappedComponent {...props}/>;
      },
    });

    return argumentContainer(Form, WrappedComponent);
  };
}

export default createBaseForm;
