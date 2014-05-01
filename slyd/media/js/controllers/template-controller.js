ASTool.MappedFieldData = Em.Object.extend({
	fieldName: null,
	extractors: [],
	required: false,
}),


ASTool.TemplateIndexController = Em.ObjectController.extend(ASTool.BaseControllerMixin,
	ASTool.DocumentViewDataSource, ASTool.DocumentViewListener, {

	needs: ['application', 'items', 'navigation', 'project_index', 'spider_index'],

	navigationLabelBinding: 'content.name',

	annotations: [],

	items: [],

	extractors: [],

	annotationsLoaded: false,

	showContinueBrowsing: true,

	showFloatingAnnotationWidgetAt: null,

	floatingAnnotation: null,

	scrapedItem: function() {
		if (!Em.isEmpty(this.get('items'))) {
			return this.get('items').findBy('name', this.get('content.scrapes'));	
		} else {
			return null;
		}
	}.property('content.scrapes', 'items.@each'),
	
	documentView: null,

	currentlySelectedElement: null,

	newReExtractor: null,

	_newTypeExtractor: 'null',

	newTypeExtractor: function(key, type) {
		if (arguments.length > 1) {
			this.set('_newTypeExtractor', type);
			if (type) {
				this.set('newReExtractor', null);
			}
		}
		return this.get('_newTypeExtractor');
	}.property('_newTypeExtractor'),

	createExtractorDisabled: function() {
		return !this.get('newTypeExtractor') && !this.get('newReExtractor');
	}.property('newReExtractor', 'newTypeExtractor'),

	sprites: function() {
		return this.get('annotations').map(function(annotation) {
			if (annotation.get('element')) {
				return ASTool.AnnotationSprite.create({'annotation': annotation});
			} else {
				return null;
			}
		}).filter(function(sprite) { return !!sprite; });
	}.property('annotations.@each.element', 'annotations.@each.highlighted'),
		
	addAnnotation: function(element, generated) {
		var annotation = ASTool.Annotation.create({
			id: ASTool.shortGuid(),
			selectedElement: element,
			generated: !!generated,
		});
		this.get('annotations').pushObject(annotation);
		return annotation;
	},

	mapAttribute: function(annotation, attribute, field) {
		annotation.removeMappings();
		annotation.addMapping(attribute, field);
	},

	makeSticky: function(annotation, attributeName) {
		var maxSticky = this.get('maxSticky');
		var stickyName = '_sticky' + (maxSticky + 1);
		annotation.addMapping(attributeName, stickyName);
		annotation.addRequired(stickyName);
	},
	
	editAnnotation: function(annotation) {
		annotation.set('highlighted', false);
		this.saveAnnotations();
		this.transitionToRoute('annotation', annotation);
	},

	deleteAnnotation: function(annotation) {
		if (annotation.get('generated')) {
			$(annotation.get('element')).removePartialAnnotation();
		}
		this.set('floatingAnnotation', null);
		this.set('showFloatingAnnotationWidgetAt', null);
		this.get('annotations').removeObject(annotation);
	},

	saveAnnotations: function() {
    this.sendFactualData();
		this.get('annotationsStore').saveAll(this.get('annotations'));
		if (this.get('content')) {
			this.set('content.annotated_body', this.get('documentView').getAnnotatedDocument());
		}
	},

  sendFactualData: function () {
    var factualData = {
      fields: {}
    }
    var routes = this.get('controllers.navigation.previousRoutes');
    factualData.projectId = routes[1].label;
    factualData.spiderId = routes[2].label;
    if (factualData.projectId && factualData.spiderId) {
      this.get('annotations').forEach(function(annotation) {
        var pageData = {}
        var field = null
        var annotations = annotation.get('annotations')
        for (var key in annotations) {
          pageData.dataSource = key;
          field = annotations[key];
        }
        var extractors = this.getAppliedExtractors(field);
        if (extractors.length > 0) {
          var extractorHash = {}
          extractors.forEach(function (extractor) {
            if (extractor.regular_expression) {
              if (!extractorHash.regexes) extractorHash.regexes = [];
              extractorHash.regexes.push(extractor.regular_expression);
            } else if (extractor.type_extractor) {
              if (!extractorHash.type) extractorHash.type = [];
              extractorHash.type.push(extractor.type_extractor);
            }
          });
          pageData.extractors = extractorHash;
        }
        pageData.generated = annotation.get('generated');
        // pageData.element = annotation.get('element');
        pageData.path = annotation.get('path');
        factualData.fields[field] = pageData;
      }.bind(this));
      factualData.annotatedPage = this.get('documentView').getAnnotatedDocument();
		  this.get('slyd').factualTemplate(factualData);
    }
  },

	saveExtractors: function() {
		// Cleanup extractor objects.
		this.get('extractors').forEach(function(extractor) {
			delete extractor['dragging'];
		});
		this.get('slyd').saveExtractors(this.get('extractors'));
	},

	maxVariant: function() {
		var maxVariant = 0;
		this.get('annotations').forEach(function(annotation) {
			var stringVariant = annotation.get('variant');
			var variant = stringVariant ? parseInt(stringVariant) : 0;
			maxVariant = variant > maxVariant ? variant : maxVariant;
		});
		return maxVariant;
	}.property('annotations.@each.variant'),

	maxSticky: function() {
		var maxSticky = 0;
		this.get('annotations').forEach(function(annotation) {
			annotation.get('stickyAttributes').forEach(function(stickyAttribute) {
				var sticky = parseInt(
					stickyAttribute.get('mappedField').substring('_sticky'.length));
				if (sticky > maxSticky) {
					maxSticky = sticky;
				}
			});
		});
		return maxSticky;
	}.property('annotations.@each.stickyAttributes.@each'),

	getAppliedExtractors: function(fieldName) {
		var extractorIds = this.get('content.extractors.' + fieldName) || [];
		return extractorIds.map(function(extractorId) {
				var extractor = this.get('extractors').filterBy('name', extractorId)[0];
				if (extractor) {
					extractor = extractor.copy();
					extractor['fieldName'] = fieldName;
					return extractor;
				} else {
					return null;	
				}
			}.bind(this)
		).filter(function(extractor){ return !!extractor });
	},

	mappedFieldsData: function() {
		var mappedFieldsData = [];
		var seenFields = new Em.Set();
		this.get('annotations').forEach(function(annotation) {
			var mappedAttributes = annotation.get('mappedAttributes');
			mappedAttributes.forEach(function(attribute) {
				var fieldName = attribute.get('mappedField');
				// Avoid duplicates.
				if (!seenFields.contains(fieldName)) {
					seenFields.add(fieldName);
					var mappedFieldData = ASTool.MappedFieldData.create();
					mappedFieldData.set('fieldName', fieldName);
					mappedFieldData.set('required', annotation.get('required').indexOf(fieldName) > -1);
					mappedFieldData.set('extractors', this.getAppliedExtractors(fieldName));
					mappedFieldsData.pushObject(mappedFieldData);
				}
			}.bind(this));
		}.bind(this));
		return mappedFieldsData;
	}.property('annotations.@each.mappedAttributes',
			   'content.extractors',
			   'extractors.@each'),

	annotationsMappingField: function(fieldName) {
		var annotations = new Em.Set();
		this.get('annotations').forEach(function(annotation) {
			var mappedAttributes = annotation.get('mappedAttributes');
			mappedAttributes.forEach(function(attribute) {
				if (attribute.get('mappedField') == fieldName) {
					annotations.add(annotation);
				}
			}.bind(this));
		}.bind(this));
		return annotations;
	},

	createExtractor: function(extractorType, extractorDefinition) {
		var extractor = ASTool.Extractor.create({
			name: ASTool.shortGuid(),
		});
		extractor.set(extractorType, extractorDefinition);
		this.get('extractors').pushObject(extractor);
	},

	draggingExtractor: function() {
		return this.get('extractors').anyBy('dragging');
	}.property('extractors.@each.dragging'),

	showFloatingAnnotationWidget: function(annotation, x, y) {
		this.set('floatingAnnotation', annotation);
		if (x < 200) {
			x = 100;
		}
		if (x > window.innerWidth - 250) {
			x = window.innerWidth - 250;
		}
		this.set('showFloatingAnnotationWidgetAt', { x: x, y: y });
	},

	hideFloatingAnnotationWidget: function() {
		this.set('floatingAnnotation', null);
		this.set('showFloatingAnnotationWidgetAt', null);
	},

	emptyAnnotations: function() {
		return this.get('annotations').filter(function(annotation) {
			return !annotation.get('mappedAttributes').length;
		});
	}.observes('annotations.@each.mappedAttributes'),

	actions: {
		
		editAnnotation: function(annotation) {
			this.editAnnotation(annotation);
		},

		mapAttribute: function(annotation, attribute, field) {
			this.mapAttribute(annotation, attribute, field);
		},

		makeSticky: function(annotation, attribute) {
			this.makeSticky(annotation, attribute);
		},
		
		deleteAnnotation: function(annotation) {
			this.deleteAnnotation(annotation);
		},

		createField: function(fieldName, fieldType) {
			this.get('controllers.items').addField(this.get('scrapedItem'), fieldName, fieldType);
			this.get('slyd').saveItems(this.get('items').toArray());
		},

		annotationHighlighted: function(annotation) {
			if (annotation.get('element')) {
				this.get('documentView').scrollToElement(annotation.get('element'));	
			}
		},

		rename: function(oldName, newName) {
			this.replaceRoute('template', this.get('model'));
		},

		createExtractor: function() {
			if (this.get('newReExtractor')) {
				this.createExtractor('regular_expression', this.get('newReExtractor'));
				this.set('newReExtractor', null);
			} else if (this.get('newTypeExtractor')) {
				this.createExtractor('type_extractor', this.get('newTypeExtractor'));	
			}
			this.saveExtractors();
		},

		deleteExtractor: function(extractor) {
			this.get('extractors').removeObject(extractor);
			this.saveExtractors();
		},

		applyExtractor: function(fieldName, extractorId) {
			var currentExtractors = this.get('content.extractors')[fieldName];
			if (!currentExtractors) {
				currentExtractors = [];
				this.set('content.extractors.' + fieldName, currentExtractors);
			}
			if (currentExtractors.indexOf(extractorId) == -1) {
				currentExtractors.pushObject(extractorId);
				this.notifyPropertyChange('content.extractors');
			}
		},

		removeAppliedExtractor: function(appliedExtractor) {
			// TODO: we need to automatically remove extractors when the field they
			// extract is no longer mapped from any annotation.
			var fieldName = appliedExtractor['fieldName'];
			this.get('content.extractors')[fieldName].removeObject(appliedExtractor['name']);
			this.notifyPropertyChange('content.extractors');
		},

		setRequired: function(fieldName, required) {
			var annotations = this.annotationsMappingField(fieldName);
			annotations.forEach(function(annotation) {
				if (required) {
					annotation.addRequired(fieldName);
				} else {
					annotation.removeRequired(fieldName);
				}
			});
		},

		editItems: function() {
			this.saveAnnotations();
			this.transitionToRoute('items');
		},

		continueBrowsing: function() {
			this.emptyAnnotations().forEach(function(annotation) {
				this.deleteAnnotation(annotation);
			}.bind(this));
			this.saveAnnotations();
			this.set('controllers.spider_index.autoloadTemplate', this.get('content'));
			this.transitionToRoute('spider');
		},
	},

	documentActions: {
		
		elementSelected: function(element, mouseX, mouseY) {
			if (element) {
				var annotation = this.addAnnotation(element);
				this.showFloatingAnnotationWidget(annotation, mouseX, mouseY);
			}
		},
		
		partialSelection: function(selection) {
			var element = $('<ins/>').get(0);
			selection.getRangeAt(0).surroundContents(element);
			this.addAnnotation(element, true);
			selection.collapse();
		},

		elementHovered: function(element, mouseX, mouseY) {
			var annotation = this.get('annotations').findBy('element', element);
			if (annotation) {
				this.showFloatingAnnotationWidget(annotation, mouseX, mouseY);
			} else {
				this.hideFloatingAnnotationWidget();
			}
		},
	},

	willEnter: function() {
		if (!this.get('annotationsLoaded')) {
			// When landing here from a shared URL there is an issue that prevents
			// the annotations from being correctly loaded. This hack (reloading
			// the route) ensures that they do load.
			Em.run.later(this, function() {
				// Forces a full model reload.
				this.replaceRoute('template', this.get('id'));
				Ember.run.later(this, function() {
					this.get('documentView').config({ mode: 'select',
							  listener: this,
							  dataSource: this,
							  partialSelects: true });
				}, 100);	
			}, 500);	
		} else {
			this.get('documentView').config({ mode: 'select',
							  listener: this,
							  dataSource: this,
							  partialSelects: true });	
		}
	},

	willLeave: function() {
		this.hideFloatingAnnotationWidget();
	}
}); 
